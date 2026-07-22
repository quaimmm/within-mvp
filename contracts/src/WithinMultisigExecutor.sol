// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title WithinMultisigExecutor
/// @notice Minimal 2-of-N treasury approval prototype for the Within hackathon demo.
/// @dev Hackathon prototype. Not audited. Not for production financial use.
contract WithinMultisigExecutor {
    struct Transaction {
        address proposer;
        address recipient;
        uint256 value;
        uint64 expiresAt;
        uint32 approvals;
        bool executed;
        bool cancelled;
        bytes data;
    }

    error InvalidConfiguration();
    error InvalidTransaction();
    error NotSigner();
    error TransactionNotFound();
    error TransactionExpired();
    error TransactionFinalized();
    error AlreadyApproved();
    error ThresholdNotReached();
    error NotProposer();
    error ExecutionFailed();

    event TransactionProposed(
        bytes32 indexed transactionId,
        address indexed proposer,
        address indexed recipient,
        uint256 value,
        uint64 expiresAt
    );
    event TransactionApproved(bytes32 indexed transactionId, address indexed signer, uint256 approvals);
    event TransactionExecuted(bytes32 indexed transactionId, address indexed recipient, uint256 value);
    event TransactionCancelled(bytes32 indexed transactionId);

    uint256 public immutable threshold;
    address[] public signers;
    mapping(address => bool) public isSigner;
    mapping(bytes32 => Transaction) private transactions;
    mapping(bytes32 => mapping(address => bool)) public hasApproved;

    modifier onlySigner() {
        if (!isSigner[msg.sender]) revert NotSigner();
        _;
    }

    constructor(address[] memory initialSigners, uint256 initialThreshold) {
        if (initialSigners.length == 0 || initialThreshold == 0 || initialThreshold > initialSigners.length) {
            revert InvalidConfiguration();
        }
        for (uint256 i; i < initialSigners.length; ++i) {
            address signer = initialSigners[i];
            if (signer == address(0) || isSigner[signer]) revert InvalidConfiguration();
            isSigner[signer] = true;
            signers.push(signer);
        }
        threshold = initialThreshold;
    }

    receive() external payable {}

    function propose(bytes32 transactionId, address recipient, uint256 value, bytes calldata data, uint64 expiresAt)
        external
        onlySigner
    {
        if (
            transactionId == bytes32(0) || recipient == address(0) || expiresAt <= block.timestamp
                || transactions[transactionId].proposer != address(0)
        ) {
            revert InvalidTransaction();
        }
        transactions[transactionId] = Transaction(msg.sender, recipient, value, expiresAt, 0, false, false, data);
        emit TransactionProposed(transactionId, msg.sender, recipient, value, expiresAt);
    }

    function approve(bytes32 transactionId) external onlySigner {
        Transaction storage transaction = _pendingTransaction(transactionId);
        if (hasApproved[transactionId][msg.sender]) revert AlreadyApproved();
        hasApproved[transactionId][msg.sender] = true;
        transaction.approvals += 1;
        emit TransactionApproved(transactionId, msg.sender, transaction.approvals);
    }

    function execute(bytes32 transactionId) external onlySigner {
        Transaction storage transaction = _pendingTransaction(transactionId);
        if (transaction.approvals < threshold) revert ThresholdNotReached();
        transaction.executed = true;
        (bool success,) = transaction.recipient.call{value: transaction.value}(transaction.data);
        if (!success) revert ExecutionFailed();
        emit TransactionExecuted(transactionId, transaction.recipient, transaction.value);
    }

    function cancel(bytes32 transactionId) external {
        Transaction storage transaction = _pendingTransaction(transactionId);
        if (msg.sender != transaction.proposer) revert NotProposer();
        transaction.cancelled = true;
        emit TransactionCancelled(transactionId);
    }

    function getTransaction(bytes32 transactionId) external view returns (Transaction memory) {
        Transaction memory transaction = transactions[transactionId];
        if (transaction.proposer == address(0)) revert TransactionNotFound();
        return transaction;
    }

    function signerCount() external view returns (uint256) {
        return signers.length;
    }

    function _pendingTransaction(bytes32 transactionId) private view returns (Transaction storage transaction) {
        transaction = transactions[transactionId];
        if (transaction.proposer == address(0)) revert TransactionNotFound();
        if (transaction.executed || transaction.cancelled) revert TransactionFinalized();
        if (transaction.expiresAt <= block.timestamp) revert TransactionExpired();
    }
}
