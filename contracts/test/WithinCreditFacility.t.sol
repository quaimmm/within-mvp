// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {WithinCreditFacility} from "../src/WithinCreditFacility.sol";
import {WithinMultisigExecutor} from "../src/WithinMultisigExecutor.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract WithinCreditFacilityTest is Test {
    uint256 constant USDC = 1e6;
    MockUSDC token;
    WithinCreditFacility facility;
    WithinMultisigExecutor executor;
    address amanda = makeAddr("Amanda");
    address olivia = makeAddr("Olivia");
    address noah = makeAddr("Noah");
    address borrower = makeAddr("Northstar Treasury");
    address outsider = makeAddr("Outsider");

    function setUp() public {
        address[] memory signers = new address[](3);
        signers[0] = amanda;
        signers[1] = olivia;
        signers[2] = noah;
        executor = new WithinMultisigExecutor(signers, 2);
        facility = new WithinCreditFacility(
            address(token = new MockUSDC()), borrower, address(executor), 25_000 * USDC, 800, address(this)
        );
        token.mint(address(facility), 25_000 * USDC);
        token.mint(borrower, 25_000 * USDC);
        vm.prank(borrower);
        token.approve(address(facility), type(uint256).max);
    }

    function request(uint256 amount, uint32 term) internal returns (uint256 id) {
        vm.prank(borrower);
        id = facility.requestDrawdown(amount, term, keccak256("Working capital"));
    }

    function proposeAndApprove(uint256 requestId, uint256 approvals) internal returns (bytes32 txId) {
        txId = keccak256(abi.encode("credit", requestId));
        vm.prank(amanda);
        executor.propose(
            txId,
            address(facility),
            0,
            abi.encodeCall(facility.approveAndDisburse, (requestId)),
            uint64(block.timestamp + 1 days)
        );
        if (approvals > 0) {
            vm.prank(amanda);
            executor.approve(txId);
        }
        if (approvals > 1) {
            vm.prank(olivia);
            executor.approve(txId);
        }
    }

    function disburse(uint256 requestId) internal returns (uint256 loanId) {
        bytes32 txId = proposeAndApprove(requestId, 2);
        vm.prank(noah);
        executor.execute(txId);
        loanId = facility.getDrawdownRequest(requestId).loanId;
    }

    function testBorrowerCreatesValidRequestUsingSixDecimals() public {
        uint256 id = request(750 * USDC, 90);
        assertEq(facility.getDrawdownRequest(id).amount, 750 * USDC);
    }

    function testRequestAboveAvailableCreditRejected() public {
        vm.expectRevert(WithinCreditFacility.CreditLimitExceeded.selector);
        request(25_001 * USDC, 90);
    }

    function testUnauthorisedBorrowerCannotRequest() public {
        vm.expectRevert(WithinCreditFacility.UnauthorisedBorrower.selector);
        vm.prank(outsider);
        facility.requestDrawdown(1 * USDC, 30, bytes32(0));
    }

    function testRequestCanBeCancelledBeforeApproval() public {
        uint256 id = request(750 * USDC, 90);
        vm.prank(borrower);
        facility.cancelDrawdown(id);
        assertEq(uint8(facility.getDrawdownRequest(id).status), uint8(WithinCreditFacility.RequestStatus.Cancelled));
    }

    function testCancelledRequestCannotBeDisbursed() public {
        uint256 id = request(750 * USDC, 90);
        vm.prank(borrower);
        facility.cancelDrawdown(id);
        bytes32 txId = proposeAndApprove(id, 2);
        vm.expectRevert(WithinMultisigExecutor.ExecutionFailed.selector);
        vm.prank(noah);
        executor.execute(txId);
    }

    function testInsufficientMultisigApprovalPreventsDisbursement() public {
        uint256 id = request(5_000 * USDC, 180);
        bytes32 txId = proposeAndApprove(id, 1);
        vm.expectRevert(WithinMultisigExecutor.ThresholdNotReached.selector);
        vm.prank(noah);
        executor.execute(txId);
    }

    function testRequiredThresholdAllowsDisbursement() public {
        uint256 id = request(5_000 * USDC, 180);
        uint256 before = token.balanceOf(borrower);
        disburse(id);
        assertEq(token.balanceOf(borrower) - before, 5_000 * USDC);
    }

    function testDisbursementOnlyOnce() public {
        uint256 id = request(750 * USDC, 90);
        disburse(id);
        vm.expectRevert(WithinCreditFacility.InvalidRequest.selector);
        vm.prank(address(executor));
        facility.approveAndDisburse(id);
    }

    function testContractWithoutLiquidityCannotDisburse() public {
        WithinCreditFacility empty =
            new WithinCreditFacility(address(token), borrower, address(this), 25_000 * USDC, 800, address(this));
        vm.prank(borrower);
        uint256 id = empty.requestDrawdown(1 * USDC, 30, bytes32(0));
        vm.expectRevert(WithinCreditFacility.InsufficientLiquidity.selector);
        empty.approveAndDisburse(id);
    }

    function testCreditLimitCannotBeExceeded() public {
        uint256 id = request(25_000 * USDC, 30);
        disburse(id);
        vm.expectRevert(WithinCreditFacility.CreditLimitExceeded.selector);
        request(1, 30);
    }

    function testPartialRepaymentUpdatesOutstanding() public {
        uint256 loan = disburse(request(5_000 * USDC, 180));
        vm.prank(borrower);
        facility.repay(loan, 1_250 * USDC);
        assertEq(facility.getLoan(loan).outstandingPrincipal, 3_750 * USDC);
    }

    function testFullRepaymentClosesLoan() public {
        uint256 loan = disburse(request(750 * USDC, 90));
        vm.prank(borrower);
        facility.repay(loan, 750 * USDC);
        assertEq(uint8(facility.getLoan(loan).status), uint8(WithinCreditFacility.LoanStatus.Repaid));
    }

    function testOverRepaymentRejected() public {
        uint256 loan = disburse(request(750 * USDC, 90));
        vm.expectRevert(WithinCreditFacility.OverRepayment.selector);
        vm.prank(borrower);
        facility.repay(loan, 751 * USDC);
    }

    function testInvalidLoanRepaymentRejected() public {
        vm.expectRevert(WithinCreditFacility.InvalidLoan.selector);
        vm.prank(borrower);
        facility.repay(999, 1 * USDC);
    }

    function testPausedFacilityBlocksProtectedActions() public {
        facility.pause();
        vm.expectRevert();
        request(1 * USDC, 30);
    }

    function testInterestUsesIntegerBasisPoints() public view {
        assertEq(facility.calculateInterest(7_500 * USDC, 180), 295_890_410);
    }

    function testAvailableCreditTracksSixDecimalPrincipal() public {
        uint256 loan = disburse(request(7_500 * USDC, 180));
        assertEq(facility.availableCredit(), 17_500 * USDC);
        vm.prank(borrower);
        facility.repay(loan, 1_250 * USDC);
        assertEq(facility.availableCredit(), 18_750 * USDC);
    }
}
