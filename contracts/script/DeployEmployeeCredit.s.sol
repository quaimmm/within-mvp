// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {WithinEmployeeCredit} from "../src/WithinEmployeeCredit.sol";

/// @notice Dedicated Arc Testnet deployment for the simple employee-credit pool.
contract DeployEmployeeCredit is Script {
    error WrongChain(uint256 actual);
    error DeployerMustBeOwner();

    function run() external returns (WithinEmployeeCredit employeeCredit) {
        if (block.chainid != 5_042_002) revert WrongChain(block.chainid);

        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address owner = vm.envOr("EMPLOYEE_CREDIT_OWNER", deployer);
        address usdc = vm.envOr(
            "EMPLOYEE_CREDIT_USDC",
            address(0x3600000000000000000000000000000000000000)
        );
        address employeeOne = vm.envOr(
            "EMPLOYEE_CREDIT_EMPLOYEE_1",
            address(0xCCE679E826618797208BB1Fba4418481d92fAaD0)
        );
        address employeeTwo = vm.envOr(
            "EMPLOYEE_CREDIT_EMPLOYEE_2",
            address(0x9ba306481F3e4E719a0152E61AABb54953ec3033)
        );
        if (deployer != owner) revert DeployerMustBeOwner();

        vm.startBroadcast(deployerPrivateKey);
        employeeCredit = new WithinEmployeeCredit(usdc, owner);
        employeeCredit.setEmployeeEligibility(employeeOne, true);
        if (employeeTwo != employeeOne) employeeCredit.setEmployeeEligibility(employeeTwo, true);
        vm.stopBroadcast();

        console2.log("WithinEmployeeCredit", address(employeeCredit));
        console2.log("Owner", owner);
        console2.log("Eligible employee 1", employeeOne);
        console2.log("Eligible employee 2", employeeTwo);
    }
}
