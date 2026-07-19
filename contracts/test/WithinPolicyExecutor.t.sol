// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {WithinPolicyExecutor} from "../src/WithinPolicyExecutor.sol";

contract RejectingRecipient {
    receive() external payable {
        revert();
    }
}

contract WithinPolicyExecutorTest is Test {
    event ExecutorUpdated(address indexed previousExecutor, address indexed newExecutor);
    event PolicyUpdated(bytes32 indexed policyId, uint256 maxPerTransaction, uint256 periodLimit, bool active);
    event PaymentExecuted(
        bytes32 indexed executionId,
        bytes32 indexed policyId,
        address indexed recipient,
        uint256 amount,
        uint256 periodId,
        uint256 totalPeriodSpend
    );

    WithinPolicyExecutor internal policyExecutor;
    address internal owner = makeAddr("owner");
    address internal executor = makeAddr("executor");
    address internal recipient = makeAddr("recipient");
    address internal outsider = makeAddr("outsider");
    bytes32 internal constant POLICY_ID = keccak256("POL-ENG-AI-001");
    bytes32 internal constant EXECUTION_ID = keccak256("APR-EMILY-OPENAI-001");

    function setUp() public {
        policyExecutor = new WithinPolicyExecutor(owner, executor);
        vm.prank(owner);
        policyExecutor.setPolicy(POLICY_ID, 0.05 ether, 1 ether, true);
        vm.deal(executor, 10 ether);
        vm.deal(outsider, 1 ether);
    }

    function testConstructorConfiguration() public view {
        assertEq(policyExecutor.owner(), owner);
        assertEq(policyExecutor.executor(), executor);
        assertEq(policyExecutor.PERIOD_DURATION(), 30 days);
    }

    function testConstructorRejectsZeroAddresses() public {
        vm.expectRevert(WithinPolicyExecutor.InvalidAddress.selector);
        new WithinPolicyExecutor(address(0), executor);
        vm.expectRevert(WithinPolicyExecutor.InvalidAddress.selector);
        new WithinPolicyExecutor(owner, address(0));
    }

    function testOwnerCanConfigurePolicy() public {
        bytes32 policyId = keccak256("NEW-POLICY");
        vm.expectEmit(true, false, false, true);
        emit PolicyUpdated(policyId, 0.05 ether, 1 ether, true);
        vm.prank(owner);
        policyExecutor.setPolicy(policyId, 0.05 ether, 1 ether, true);
        (bool exists, bool active, uint256 maxPerTransaction, uint256 periodLimit) = policyExecutor.policies(policyId);
        assertTrue(exists);
        assertTrue(active);
        assertEq(maxPerTransaction, 0.05 ether);
        assertEq(periodLimit, 1 ether);
    }

    function testNonOwnerCannotConfigurePolicy() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        vm.prank(outsider);
        policyExecutor.setPolicy(keccak256("NEW-POLICY"), 0.05 ether, 1 ether, true);
    }

    function testOwnerCanChangeExecutor() public {
        address newExecutor = makeAddr("newExecutor");
        vm.expectEmit(true, true, false, true);
        emit ExecutorUpdated(executor, newExecutor);
        vm.prank(owner);
        policyExecutor.setExecutor(newExecutor);
        assertEq(policyExecutor.executor(), newExecutor);
    }

    function testNonExecutorCannotExecutePayment() public {
        vm.expectRevert(WithinPolicyExecutor.UnauthorizedExecutor.selector);
        vm.prank(outsider);
        policyExecutor.executePayment{value: 0.01 ether}(EXECUTION_ID, POLICY_ID, payable(recipient));
    }

    function testNonexistentPolicyIsRejected() public {
        vm.expectRevert(WithinPolicyExecutor.PolicyNotFound.selector);
        vm.prank(executor);
        policyExecutor.executePayment{value: 0.01 ether}(EXECUTION_ID, keccak256("UNKNOWN"), payable(recipient));
    }

    function testInactivePolicyIsRejected() public {
        vm.prank(owner);
        policyExecutor.setPolicyActive(POLICY_ID, false);
        vm.expectRevert(WithinPolicyExecutor.PolicyInactive.selector);
        vm.prank(executor);
        policyExecutor.executePayment{value: 0.01 ether}(EXECUTION_ID, POLICY_ID, payable(recipient));
    }

    function testZeroRecipientIsRejected() public {
        vm.expectRevert(WithinPolicyExecutor.InvalidAddress.selector);
        vm.prank(executor);
        policyExecutor.executePayment{value: 0.01 ether}(EXECUTION_ID, POLICY_ID, payable(address(0)));
    }

    function testZeroPaymentIsRejected() public {
        vm.expectRevert(WithinPolicyExecutor.InvalidAmount.selector);
        vm.prank(executor);
        policyExecutor.executePayment(EXECUTION_ID, POLICY_ID, payable(recipient));
    }

    function testAmountAboveTransactionLimitIsRejected() public {
        vm.expectRevert(WithinPolicyExecutor.TransactionLimitExceeded.selector);
        vm.prank(executor);
        policyExecutor.executePayment{value: 0.051 ether}(EXECUTION_ID, POLICY_ID, payable(recipient));
    }

    function testCumulativePeriodLimitIsEnforced() public {
        vm.prank(owner);
        policyExecutor.setPolicy(POLICY_ID, 0.02 ether, 0.02 ether, true);
        vm.prank(executor);
        policyExecutor.executePayment{value: 0.01 ether}(keccak256("one"), POLICY_ID, payable(recipient));
        vm.prank(executor);
        policyExecutor.executePayment{value: 0.01 ether}(keccak256("two"), POLICY_ID, payable(recipient));
        vm.expectRevert(WithinPolicyExecutor.PeriodLimitExceeded.selector);
        vm.prank(executor);
        policyExecutor.executePayment{value: 0.01 ether}(keccak256("three"), POLICY_ID, payable(recipient));
    }

    function testDuplicateExecutionIdIsRejected() public {
        vm.prank(executor);
        policyExecutor.executePayment{value: 0.01 ether}(EXECUTION_ID, POLICY_ID, payable(recipient));
        vm.expectRevert(WithinPolicyExecutor.ExecutionAlreadyUsed.selector);
        vm.prank(executor);
        policyExecutor.executePayment{value: 0.01 ether}(EXECUTION_ID, POLICY_ID, payable(recipient));
    }

    function testRecipientReceivesExactAmount() public {
        uint256 balanceBefore = recipient.balance;
        vm.prank(executor);
        policyExecutor.executePayment{value: 0.01 ether}(EXECUTION_ID, POLICY_ID, payable(recipient));
        assertEq(recipient.balance - balanceBefore, 0.01 ether);
    }

    function testPaymentEventIsEmittedCorrectly() public {
        uint256 periodId = block.timestamp / 30 days;
        vm.expectEmit(true, true, true, true);
        emit PaymentExecuted(EXECUTION_ID, POLICY_ID, recipient, 0.01 ether, periodId, 0.01 ether);
        vm.prank(executor);
        policyExecutor.executePayment{value: 0.01 ether}(EXECUTION_ID, POLICY_ID, payable(recipient));
    }

    function testPausingBlocksExecution() public {
        vm.prank(owner);
        policyExecutor.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(executor);
        policyExecutor.executePayment{value: 0.01 ether}(EXECUTION_ID, POLICY_ID, payable(recipient));
    }

    function testUnpausingRestoresExecution() public {
        vm.startPrank(owner);
        policyExecutor.pause();
        policyExecutor.unpause();
        vm.stopPrank();
        vm.prank(executor);
        policyExecutor.executePayment{value: 0.01 ether}(EXECUTION_ID, POLICY_ID, payable(recipient));
        assertTrue(policyExecutor.usedExecutionIds(EXECUTION_ID));
    }

    function testRecipientTransferFailureRevertsWithoutConsumingState() public {
        RejectingRecipient rejectingRecipient = new RejectingRecipient();
        uint256 periodId = block.timestamp / 30 days;
        vm.expectRevert(WithinPolicyExecutor.PaymentTransferFailed.selector);
        vm.prank(executor);
        policyExecutor.executePayment{value: 0.01 ether}(EXECUTION_ID, POLICY_ID, payable(address(rejectingRecipient)));
        assertFalse(policyExecutor.usedExecutionIds(EXECUTION_ID));
        assertEq(policyExecutor.policyPeriodSpend(POLICY_ID, periodId), 0);
    }

    function testTwoDifferentExecutionIdsCanSucceed() public {
        vm.startPrank(executor);
        policyExecutor.executePayment{value: 0.01 ether}(keccak256("one"), POLICY_ID, payable(recipient));
        policyExecutor.executePayment{value: 0.01 ether}(keccak256("two"), POLICY_ID, payable(recipient));
        vm.stopPrank();
        assertEq(recipient.balance, 0.02 ether);
    }

    function testPlainNativeTransferIsRejected() public {
        vm.expectRevert();
        vm.prank(executor);
        payable(address(policyExecutor)).transfer(0.01 ether);
    }
}
