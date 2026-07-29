// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {WithinEmployeeCredit} from "../src/WithinEmployeeCredit.sol";

contract EmployeeCreditMockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract ReentrantEmployeeCreditUSDC is EmployeeCreditMockUSDC {
    WithinEmployeeCredit public target;
    bool public attack;

    function configure(WithinEmployeeCredit target_) external {
        target = target_;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (attack) target.drawCredit(1, 1, uint64(block.timestamp + 1 days));
        return super.transfer(to, value);
    }

    function setAttack(bool value) external {
        attack = value;
    }
}

contract WithinEmployeeCreditTest is Test {
    uint256 constant USDC = 1e6;
    EmployeeCreditMockUSDC token;
    WithinEmployeeCredit credit;
    address employee = makeAddr("Employee");
    address outsider = makeAddr("Outsider");
    uint64 firstDueDate;

    event EmployeeEligibilityUpdated(address indexed employee, bool eligible);
    event CreditDrawn(address indexed employee, uint256 amount, uint8 instalments, uint256 instalmentAmount, uint64 firstDueDate);
    event InstalmentRepaid(address indexed employee, uint256 amount, uint256 outstanding, uint8 instalmentsPaid, uint64 nextDueDate);
    event CreditClosed(address indexed employee, uint256 totalRepaid);

    function setUp() public {
        token = new EmployeeCreditMockUSDC();
        credit = new WithinEmployeeCredit(address(token), address(this));
        token.mint(address(credit), 5_000 * USDC);
        token.mint(employee, 2_000 * USDC);
        credit.setEmployeeEligibility(employee, true);
        firstDueDate = uint64(block.timestamp + 14 days);
    }

    function draw(uint256 amount, uint8 instalments) internal {
        vm.prank(employee);
        credit.drawCredit(amount, instalments, firstDueDate);
    }

    function testOwnerCanEnableEmployeeAndEventValues() public {
        vm.expectEmit(true, false, false, true);
        emit EmployeeEligibilityUpdated(outsider, true);
        credit.setEmployeeEligibility(outsider, true);
        assertTrue(credit.isEmployeeEligible(outsider));
    }

    function testNonOwnerCannotChangeEligibility() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        vm.prank(outsider);
        credit.setEmployeeEligibility(outsider, true);
    }

    function testNonEligibleWalletCannotDrawCredit() public {
        vm.expectRevert(WithinEmployeeCredit.EmployeeNotEligible.selector);
        vm.prank(outsider);
        credit.drawCredit(750 * USDC, 3, firstDueDate);
    }

    function testEligibleEmployeeDrawsCreditAndReceivesUSDC() public {
        uint256 beforeBalance = token.balanceOf(employee);
        vm.expectEmit(true, false, false, true);
        emit CreditDrawn(employee, 750 * USDC, 3, 250 * USDC, firstDueDate);
        draw(750 * USDC, 3);
        WithinEmployeeCredit.CreditAccount memory account = credit.getCreditAccount(employee);
        assertEq(token.balanceOf(employee) - beforeBalance, 750 * USDC);
        assertEq(account.outstanding, 750 * USDC);
        assertEq(account.totalBorrowed, 750 * USDC);
        assertEq(account.instalmentAmount, 250 * USDC);
        assertTrue(account.active);
    }

    function testMaximumCreditIsTwoThousandUSDC() public {
        assertEq(credit.MAX_CREDIT_LIMIT(), 2_000 * USDC);
        draw(2_000 * USDC, 1);
        assertEq(credit.availableCredit(employee), 0);
    }

    function testAmountAboveMaximumReverts() public {
        vm.expectRevert(WithinEmployeeCredit.CreditLimitExceeded.selector);
        vm.prank(employee);
        credit.drawCredit(2_000 * USDC + 1, 1, firstDueDate);
    }

    function testOnlyOneTwoOrThreeInstalmentsAccepted() public {
        vm.expectRevert(WithinEmployeeCredit.InvalidInstalmentPlan.selector);
        vm.prank(employee);
        credit.drawCredit(1 * USDC, 0, firstDueDate);
        vm.expectRevert(WithinEmployeeCredit.InvalidInstalmentPlan.selector);
        vm.prank(employee);
        credit.drawCredit(1 * USDC, 4, firstDueDate);
    }

    function testInsufficientPoolLiquidityReverts() public {
        WithinEmployeeCredit empty = new WithinEmployeeCredit(address(token), address(this));
        empty.setEmployeeEligibility(employee, true);
        vm.expectRevert(WithinEmployeeCredit.InsufficientPoolLiquidity.selector);
        vm.prank(employee);
        empty.drawCredit(1 * USDC, 1, firstDueDate);
    }

    function testAvailableCreditTracksOutstandingAndSecondActiveCreditIsBlocked() public {
        draw(750 * USDC, 3);
        assertEq(credit.availableCredit(employee), 1_250 * USDC);
        vm.expectRevert(WithinEmployeeCredit.ActiveCreditExists.selector);
        vm.prank(employee);
        credit.drawCredit(1 * USDC, 1, firstDueDate);
    }

    function testRepaymentRequiresAllowance() public {
        draw(750 * USDC, 3);
        vm.expectRevert();
        vm.prank(employee);
        credit.repayNextInstalment();
    }

    function testFirstInstalmentUpdatesAccountDueDateAndPool() public {
        uint256 poolAfterDraw = credit.poolBalance();
        draw(750 * USDC, 3);
        poolAfterDraw = credit.poolBalance();
        vm.prank(employee);
        token.approve(address(credit), 250 * USDC);
        vm.expectEmit(true, false, false, true);
        emit InstalmentRepaid(employee, 250 * USDC, 500 * USDC, 1, firstDueDate + 30 days);
        vm.prank(employee);
        credit.repayNextInstalment();
        WithinEmployeeCredit.CreditAccount memory account = credit.getCreditAccount(employee);
        assertEq(account.outstanding, 500 * USDC);
        assertEq(account.instalmentsPaid, 1);
        assertEq(account.nextDueDate, firstDueDate + 30 days);
        assertEq(credit.availableCredit(employee), 1_500 * USDC);
        assertEq(credit.poolBalance(), poolAfterDraw + 250 * USDC);
    }

    function testFinalInstalmentUsesRemainderAndClosesCredit() public {
        draw(10, 3);
        vm.prank(employee);
        token.approve(address(credit), 10);
        vm.prank(employee);
        credit.repayNextInstalment();
        vm.prank(employee);
        credit.repayNextInstalment();
        vm.expectEmit(true, false, false, true);
        emit CreditClosed(employee, 10);
        vm.prank(employee);
        credit.repayNextInstalment();
        WithinEmployeeCredit.CreditAccount memory account = credit.getCreditAccount(employee);
        assertEq(account.outstanding, 0);
        assertEq(account.totalRepaid, 10);
        assertFalse(account.active);
    }

    function testPoolBalanceDecreasesOnDraw() public {
        uint256 beforeBalance = credit.poolBalance();
        draw(750 * USDC, 3);
        assertEq(credit.poolBalance(), beforeBalance - 750 * USDC);
    }

    function testReentrancyProtection() public {
        ReentrantEmployeeCreditUSDC malicious = new ReentrantEmployeeCreditUSDC();
        WithinEmployeeCredit guarded = new WithinEmployeeCredit(address(malicious), address(this));
        malicious.configure(guarded);
        guarded.setEmployeeEligibility(employee, true);
        guarded.setEmployeeEligibility(address(malicious), true);
        malicious.mint(address(guarded), 5_000 * USDC);
        malicious.setAttack(true);
        vm.expectRevert();
        vm.prank(employee);
        guarded.drawCredit(750 * USDC, 3, firstDueDate);
    }
}
