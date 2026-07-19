// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {WithinPolicyExecutor} from "../src/WithinPolicyExecutor.sol";

contract DeployWithinPolicyExecutor is Script {
    error DeploymentOwnerMustMatchBroadcaster();

    function run() external returns (WithinPolicyExecutor policyExecutor) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address initialOwner = vm.envAddress("WITHIN_CONTRACT_OWNER");
        address initialExecutor = vm.envAddress("WITHIN_CONTRACT_EXECUTOR");
        address broadcaster = vm.addr(privateKey);
        if (initialOwner != broadcaster) revert DeploymentOwnerMustMatchBroadcaster();

        bytes32 policyKey = keccak256(bytes("POL-ENG-AI-001"));

        vm.startBroadcast(privateKey);
        policyExecutor = new WithinPolicyExecutor(initialOwner, initialExecutor);
        policyExecutor.setPolicy(policyKey, 0.05 ether, 1 ether, true);
        vm.stopBroadcast();

        console2.log("WithinPolicyExecutor", address(policyExecutor));
        console2.log("Owner", initialOwner);
        console2.log("Executor", initialExecutor);
        console2.logBytes32(policyKey);
        console2.log("Chain ID", block.chainid);
        console2.log("Broadcaster", broadcaster);
    }
}
