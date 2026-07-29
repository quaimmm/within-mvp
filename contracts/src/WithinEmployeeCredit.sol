// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title WithinEmployeeCredit
/// @notice Arc Testnet employee credit prototype. Not audited.
contract WithinEmployeeCredit is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_CREDIT_LIMIT = 2_000e6;
    uint64 public constant REPAYMENT_INTERVAL = 30 days;

    struct CreditAccount {
        uint256 outstanding;
        uint256 totalBorrowed;
        uint256 totalRepaid;
        uint256 instalmentAmount;
        uint8 totalInstalments;
        uint8 instalmentsPaid;
        uint64 firstDueDate;
        uint64 nextDueDate;
        bool active;
    }

    IERC20 public immutable usdc;
    mapping(address => bool) public eligibleEmployees;
    mapping(address => CreditAccount) private accounts;

    error ZeroAddress();
    error EmployeeNotEligible();
    error InvalidAmount();
    error CreditLimitExceeded();
    error ActiveCreditExists();
    error InvalidInstalmentPlan();
    error InvalidDueDate();
    error InsufficientPoolLiquidity();
    error NoActiveCredit();

    event EmployeeEligibilityUpdated(address indexed employee, bool eligible);
    event CreditDrawn(
        address indexed employee,
        uint256 amount,
        uint8 instalments,
        uint256 instalmentAmount,
        uint64 firstDueDate
    );
    event InstalmentRepaid(
        address indexed employee,
        uint256 amount,
        uint256 outstanding,
        uint8 instalmentsPaid,
        uint64 nextDueDate
    );
    event CreditClosed(address indexed employee, uint256 totalRepaid);

    constructor(address usdc_, address owner_) Ownable(owner_) {
        if (usdc_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
    }

    function setEmployeeEligibility(address employee, bool eligible) external onlyOwner {
        if (employee == address(0)) revert ZeroAddress();
        eligibleEmployees[employee] = eligible;
        emit EmployeeEligibilityUpdated(employee, eligible);
    }

    function drawCredit(uint256 amount, uint8 instalments, uint64 firstDueDate) external nonReentrant {
        if (!eligibleEmployees[msg.sender]) revert EmployeeNotEligible();
        if (amount == 0) revert InvalidAmount();
        if (amount > MAX_CREDIT_LIMIT) revert CreditLimitExceeded();
        if (accounts[msg.sender].active) revert ActiveCreditExists();
        if (instalments < 1 || instalments > 3) revert InvalidInstalmentPlan();
        if (firstDueDate <= block.timestamp) revert InvalidDueDate();
        if (usdc.balanceOf(address(this)) < amount) revert InsufficientPoolLiquidity();

        uint256 instalmentAmount = (amount + instalments - 1) / instalments;
        CreditAccount storage account = accounts[msg.sender];
        account.outstanding = amount;
        account.totalBorrowed += amount;
        account.instalmentAmount = instalmentAmount;
        account.totalInstalments = instalments;
        account.instalmentsPaid = 0;
        account.firstDueDate = firstDueDate;
        account.nextDueDate = firstDueDate;
        account.active = true;

        usdc.safeTransfer(msg.sender, amount);
        emit CreditDrawn(msg.sender, amount, instalments, instalmentAmount, firstDueDate);
    }

    function repayNextInstalment() external nonReentrant {
        CreditAccount storage account = accounts[msg.sender];
        if (!account.active) revert NoActiveCredit();

        uint256 amount = account.outstanding < account.instalmentAmount
            ? account.outstanding
            : account.instalmentAmount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        account.outstanding -= amount;
        account.totalRepaid += amount;
        account.instalmentsPaid += 1;
        if (account.outstanding == 0) {
            account.active = false;
            account.nextDueDate = 0;
            emit InstalmentRepaid(msg.sender, amount, 0, account.instalmentsPaid, 0);
            emit CreditClosed(msg.sender, account.totalRepaid);
            return;
        }

        account.nextDueDate += REPAYMENT_INTERVAL;
        emit InstalmentRepaid(
            msg.sender,
            amount,
            account.outstanding,
            account.instalmentsPaid,
            account.nextDueDate
        );
    }

    function getCreditAccount(address employee) external view returns (CreditAccount memory) {
        return accounts[employee];
    }

    function availableCredit(address employee) external view returns (uint256) {
        uint256 outstanding = accounts[employee].outstanding;
        return outstanding >= MAX_CREDIT_LIMIT ? 0 : MAX_CREDIT_LIMIT - outstanding;
    }

    function poolBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function isEmployeeEligible(address employee) external view returns (bool) {
        return eligibleEmployees[employee];
    }
}
