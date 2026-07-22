// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {WithinMultisigExecutor} from "../src/WithinMultisigExecutor.sol";

contract WithinMultisigExecutorTest is Test {
    WithinMultisigExecutor internal executor;
    address internal amanda = makeAddr("Amanda");
    address internal olivia = makeAddr("Olivia");
    address internal noah = makeAddr("Noah");
    address internal outsider = makeAddr("Outsider");
    address internal recipient = makeAddr("British Airways");
    bytes32 internal constant TRANSACTION_ID = keccak256("MSIG-BA-001");

    function setUp() public {
        address[] memory signers = new address[](3);
        signers[0] = amanda;
        signers[1] = olivia;
        signers[2] = noah;
        executor = new WithinMultisigExecutor(signers, 2);
        vm.deal(address(executor), 10 ether);
        vm.prank(amanda);
        executor.propose(TRANSACTION_ID, recipient, 1 ether, "", uint64(block.timestamp + 1 days));
    }

    function testConstructorStoresSignersAndThreshold() public view {
        assertEq(executor.threshold(), 2);
        assertEq(executor.signerCount(), 3);
        assertTrue(executor.isSigner(amanda));
    }

    function testSignerCanProposeTransaction() public {
        bytes32 secondId = keccak256("MSIG-SECOND");
        vm.prank(olivia);
        executor.propose(secondId, recipient, 2 ether, "", uint64(block.timestamp + 1 days));
        assertEq(executor.getTransaction(secondId).proposer, olivia);
    }

    function testRejectsInvalidThresholdAndDuplicateSigners() public {
        address[] memory signers = new address[](2);
        signers[0] = amanda;
        signers[1] = amanda;
        vm.expectRevert(WithinMultisigExecutor.InvalidConfiguration.selector);
        new WithinMultisigExecutor(signers, 2);
    }

    function testNonSignerCannotProposeOrApprove() public {
        vm.expectRevert(WithinMultisigExecutor.NotSigner.selector);
        vm.prank(outsider);
        executor.approve(TRANSACTION_ID);
    }

    function testFirstSignerApprovalIsRecorded() public {
        vm.prank(olivia);
        executor.approve(TRANSACTION_ID);
        assertTrue(executor.hasApproved(TRANSACTION_ID, olivia));
        assertEq(executor.getTransaction(TRANSACTION_ID).approvals, 1);
    }

    function testDuplicateSignerApprovalIsRejected() public {
        vm.startPrank(olivia);
        executor.approve(TRANSACTION_ID);
        vm.expectRevert(WithinMultisigExecutor.AlreadyApproved.selector);
        executor.approve(TRANSACTION_ID);
        vm.stopPrank();
    }

    function testCannotExecuteBeforeThreshold() public {
        vm.prank(olivia);
        executor.approve(TRANSACTION_ID);
        vm.expectRevert(WithinMultisigExecutor.ThresholdNotReached.selector);
        vm.prank(amanda);
        executor.execute(TRANSACTION_ID);
    }

    function testTwoApprovalsExecuteExactValue() public {
        vm.prank(olivia);
        executor.approve(TRANSACTION_ID);
        vm.prank(noah);
        executor.approve(TRANSACTION_ID);
        uint256 beforeBalance = recipient.balance;
        vm.prank(amanda);
        executor.execute(TRANSACTION_ID);
        assertEq(recipient.balance - beforeBalance, 1 ether);
        assertTrue(executor.getTransaction(TRANSACTION_ID).executed);
    }

    function testExecutionCannotRunTwice() public {
        vm.prank(olivia);
        executor.approve(TRANSACTION_ID);
        vm.prank(noah);
        executor.approve(TRANSACTION_ID);
        vm.startPrank(amanda);
        executor.execute(TRANSACTION_ID);
        vm.expectRevert(WithinMultisigExecutor.TransactionFinalized.selector);
        executor.execute(TRANSACTION_ID);
        vm.stopPrank();
    }

    function testExpiredTransactionCannotExecute() public {
        vm.prank(olivia);
        executor.approve(TRANSACTION_ID);
        vm.prank(noah);
        executor.approve(TRANSACTION_ID);
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(WithinMultisigExecutor.TransactionExpired.selector);
        vm.prank(amanda);
        executor.execute(TRANSACTION_ID);
    }

    function testProposerCanCancelAndCancelledTransactionCannotExecute() public {
        vm.prank(amanda);
        executor.cancel(TRANSACTION_ID);
        assertTrue(executor.getTransaction(TRANSACTION_ID).cancelled);
        vm.expectRevert(WithinMultisigExecutor.TransactionFinalized.selector);
        vm.prank(amanda);
        executor.execute(TRANSACTION_ID);
    }
}
