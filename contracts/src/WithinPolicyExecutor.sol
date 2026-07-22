// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Hackathon prototype. Not audited. Not for production financial use.
contract WithinPolicyExecutor is Ownable, Pausable, ReentrancyGuard {
    struct Policy {
        bool exists;
        bool active;
        uint256 maxPerTransaction;
        uint256 periodLimit;
    }

    error UnauthorizedExecutor();
    error InvalidAddress();
    error InvalidPolicy();
    error PolicyNotFound();
    error PolicyInactive();
    error InvalidAmount();
    error TransactionLimitExceeded();
    error PeriodLimitExceeded();
    error ExecutionAlreadyUsed();
    error PaymentTransferFailed();

    event ExecutorUpdated(address indexed previousExecutor, address indexed newExecutor);
    event PolicyUpdated(bytes32 indexed policyId, uint256 maxPerTransaction, uint256 periodLimit, bool active);
    event PolicyStatusChanged(bytes32 indexed policyId, bool active);
    event PaymentExecuted(
        bytes32 indexed executionId,
        bytes32 indexed policyId,
        address indexed recipient,
        uint256 amount,
        uint256 periodId,
        uint256 totalPeriodSpend
    );

    uint256 public constant PERIOD_DURATION = 30 days;

    address public executor;
    mapping(bytes32 policyId => Policy policy) public policies;
    mapping(bytes32 policyId => mapping(uint256 periodId => uint256 amount)) public policyPeriodSpend;
    mapping(bytes32 executionId => bool used) public usedExecutionIds;

    modifier onlyExecutor() {
        if (msg.sender != executor) revert UnauthorizedExecutor();
        _;
    }

    constructor(address initialOwner, address initialExecutor) Ownable(_validAddress(initialOwner)) {
        if (initialExecutor == address(0)) revert InvalidAddress();
        executor = initialExecutor;
        emit ExecutorUpdated(address(0), initialExecutor);
    }

    function setExecutor(address newExecutor) external onlyOwner {
        if (newExecutor == address(0)) revert InvalidAddress();
        address previousExecutor = executor;
        executor = newExecutor;
        emit ExecutorUpdated(previousExecutor, newExecutor);
    }

    function setPolicy(bytes32 policyId, uint256 maxPerTransaction, uint256 periodLimit, bool active)
        external
        onlyOwner
    {
        if (policyId == bytes32(0) || maxPerTransaction == 0 || periodLimit < maxPerTransaction) {
            revert InvalidPolicy();
        }

        policies[policyId] =
            Policy({exists: true, active: active, maxPerTransaction: maxPerTransaction, periodLimit: periodLimit});

        emit PolicyUpdated(policyId, maxPerTransaction, periodLimit, active);
    }

    function setPolicyActive(bytes32 policyId, bool active) external onlyOwner {
        Policy storage policy = policies[policyId];
        if (!policy.exists) revert PolicyNotFound();
        policy.active = active;
        emit PolicyStatusChanged(policyId, active);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function executePayment(bytes32 executionId, bytes32 policyId, address payable recipient)
        external
        payable
        onlyExecutor
        whenNotPaused
        nonReentrant
    {
        if (usedExecutionIds[executionId]) revert ExecutionAlreadyUsed();

        Policy memory policy = policies[policyId];
        if (!policy.exists) revert PolicyNotFound();
        if (!policy.active) revert PolicyInactive();
        if (recipient == address(0)) revert InvalidAddress();
        if (msg.value == 0) revert InvalidAmount();
        if (msg.value > policy.maxPerTransaction) revert TransactionLimitExceeded();

        uint256 periodId = block.timestamp / PERIOD_DURATION;
        uint256 totalPeriodSpend = policyPeriodSpend[policyId][periodId] + msg.value;
        if (totalPeriodSpend > policy.periodLimit) revert PeriodLimitExceeded();

        usedExecutionIds[executionId] = true;
        policyPeriodSpend[policyId][periodId] = totalPeriodSpend;

        (bool sent,) = recipient.call{value: msg.value}("");
        if (!sent) revert PaymentTransferFailed();

        emit PaymentExecuted(executionId, policyId, recipient, msg.value, periodId, totalPeriodSpend);
    }

    function _validAddress(address account) private pure returns (address) {
        if (account == address(0)) revert InvalidAddress();
        return account;
    }
}
