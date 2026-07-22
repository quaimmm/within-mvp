// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title WithinCreditFacility
/// @notice Hackathon prototype. Not audited. Not for production lending.
/// @dev All application-level USDC accounting uses ERC-20 6-decimal units.
contract WithinCreditFacility is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    enum RequestStatus {
        None,
        Pending,
        Cancelled,
        Disbursed
    }
    enum LoanStatus {
        None,
        Active,
        Repaid,
        Cancelled,
        Defaulted
    }

    struct DrawdownRequest {
        address borrower;
        uint256 amount;
        uint32 termDays;
        bytes32 purposeHash;
        RequestStatus status;
        uint256 loanId;
    }

    struct Loan {
        uint256 requestId;
        uint256 principal;
        uint256 totalDue;
        uint256 amountRepaid;
        uint256 outstandingPrincipal;
        uint64 maturityDate;
        LoanStatus status;
    }

    error ZeroAddress();
    error InvalidAmount();
    error InvalidTerm();
    error UnauthorisedBorrower();
    error UnauthorisedExecutor();
    error InvalidRequest();
    error InvalidLoan();
    error CreditLimitExceeded();
    error InsufficientLiquidity();
    error OverRepayment();

    event DrawdownRequested(
        uint256 indexed requestId, address indexed borrower, uint256 amount, uint32 termDays, bytes32 purposeHash
    );
    event DrawdownCancelled(uint256 indexed requestId);
    event CreditDisbursed(uint256 indexed requestId, uint256 indexed loanId, uint256 principal, uint256 totalDue);
    event CreditRepaid(uint256 indexed loanId, address indexed payer, uint256 amount, uint256 outstandingPrincipal);
    event FacilityPaused(address indexed account);
    event FacilityUnpaused(address indexed account);

    IERC20 public immutable usdc;
    address public immutable approvedBorrower;
    address public immutable multisigExecutor;
    uint256 public immutable creditLimit;
    uint16 public immutable annualRateBps;

    uint256 public nextRequestId = 1;
    uint256 public nextLoanId = 1;
    uint256 public totalOutstandingPrincipal;
    mapping(uint256 => DrawdownRequest) private requests;
    mapping(uint256 => Loan) private loans;

    modifier onlyBorrower() {
        if (msg.sender != approvedBorrower) revert UnauthorisedBorrower();
        _;
    }

    modifier onlyExecutor() {
        if (msg.sender != multisigExecutor) revert UnauthorisedExecutor();
        _;
    }

    constructor(
        address usdc_,
        address borrower_,
        address executor_,
        uint256 creditLimit_,
        uint16 annualRateBps_,
        address owner_
    ) Ownable(owner_) {
        if (usdc_ == address(0) || borrower_ == address(0) || executor_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        if (creditLimit_ == 0) revert InvalidAmount();
        usdc = IERC20(usdc_);
        approvedBorrower = borrower_;
        multisigExecutor = executor_;
        creditLimit = creditLimit_;
        annualRateBps = annualRateBps_;
    }

    function requestDrawdown(uint256 amount, uint32 termDays, bytes32 purposeHash)
        external
        onlyBorrower
        whenNotPaused
        returns (uint256 requestId)
    {
        if (amount == 0) revert InvalidAmount();
        if (termDays == 0) revert InvalidTerm();
        if (amount > availableCredit()) revert CreditLimitExceeded();
        requestId = nextRequestId++;
        requests[requestId] = DrawdownRequest(msg.sender, amount, termDays, purposeHash, RequestStatus.Pending, 0);
        emit DrawdownRequested(requestId, msg.sender, amount, termDays, purposeHash);
    }

    function cancelDrawdown(uint256 requestId) external onlyBorrower whenNotPaused {
        DrawdownRequest storage request = requests[requestId];
        if (request.status != RequestStatus.Pending) revert InvalidRequest();
        request.status = RequestStatus.Cancelled;
        emit DrawdownCancelled(requestId);
    }

    function approveAndDisburse(uint256 requestId)
        external
        onlyExecutor
        whenNotPaused
        nonReentrant
        returns (uint256 loanId)
    {
        DrawdownRequest storage request = requests[requestId];
        if (request.status != RequestStatus.Pending) revert InvalidRequest();
        if (request.amount > availableCredit()) revert CreditLimitExceeded();
        if (usdc.balanceOf(address(this)) < request.amount) revert InsufficientLiquidity();
        uint256 interest = calculateInterest(request.amount, request.termDays);
        loanId = nextLoanId++;
        request.status = RequestStatus.Disbursed;
        request.loanId = loanId;
        totalOutstandingPrincipal += request.amount;
        loans[loanId] = Loan(
            requestId,
            request.amount,
            request.amount + interest,
            0,
            request.amount,
            uint64(block.timestamp + uint256(request.termDays) * 1 days),
            LoanStatus.Active
        );
        usdc.safeTransfer(approvedBorrower, request.amount);
        emit CreditDisbursed(requestId, loanId, request.amount, request.amount + interest);
    }

    function repay(uint256 loanId, uint256 amount) external whenNotPaused nonReentrant {
        Loan storage loan = loans[loanId];
        if (loan.status != LoanStatus.Active) revert InvalidLoan();
        if (amount == 0) revert InvalidAmount();
        if (amount > loan.outstandingPrincipal) revert OverRepayment();
        loan.amountRepaid += amount;
        loan.outstandingPrincipal -= amount;
        totalOutstandingPrincipal -= amount;
        if (loan.outstandingPrincipal == 0) loan.status = LoanStatus.Repaid;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit CreditRepaid(loanId, msg.sender, amount, loan.outstandingPrincipal);
    }

    function pause() external onlyOwner {
        _pause();
        emit FacilityPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        _unpause();
        emit FacilityUnpaused(msg.sender);
    }

    function calculateInterest(uint256 principal, uint32 termDays) public view returns (uint256) {
        return principal * uint256(annualRateBps) * uint256(termDays) / (10_000 * 365);
    }

    function getDrawdownRequest(uint256 requestId) external view returns (DrawdownRequest memory) {
        DrawdownRequest memory request = requests[requestId];
        if (request.status == RequestStatus.None) revert InvalidRequest();
        return request;
    }

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        Loan memory loan = loans[loanId];
        if (loan.status == LoanStatus.None) revert InvalidLoan();
        return loan;
    }

    function availableCredit() public view returns (uint256) {
        return creditLimit - totalOutstandingPrincipal;
    }

    function facilityBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
