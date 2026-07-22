// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {WithinPolicyExecutor} from "../src/WithinPolicyExecutor.sol";
import {WithinMultisigExecutor} from "../src/WithinMultisigExecutor.sol";
import {WithinCreditFacility} from "../src/WithinCreditFacility.sol";

/// @notice Arc Testnet deployment sequence. Running without --broadcast only simulates it.
contract DeployWithin is Script {
    uint256 internal constant USDC_SCALE = 1e6;

    error WrongChain(uint256 actual);
    error InvalidSignerConfiguration();
    error DeployerMustBeTreasuryOwner();

    function run()
        external
        returns (
            WithinPolicyExecutor policyExecutor,
            WithinMultisigExecutor multisigExecutor,
            WithinCreditFacility creditFacility
        )
    {
        if (block.chainid != 5_042_002) revert WrongChain(block.chainid);

        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address borrower = vm.envAddress("BORROWER_TREASURY_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address[] memory signers = new address[](3);
        signers[0] = vm.envAddress("MULTISIG_SIGNER_1");
        signers[1] = vm.envAddress("MULTISIG_SIGNER_2");
        signers[2] = vm.envAddress("MULTISIG_SIGNER_3");
        uint256 threshold = vm.envUint("MULTISIG_THRESHOLD");
        uint256 creditLimit = vm.envUint("CREDIT_LIMIT_USDC") * USDC_SCALE;
        uint16 creditRateBps = uint16(vm.envUint("CREDIT_RATE_BPS"));

        if (deployer != treasury) revert DeployerMustBeTreasuryOwner();
        if (signers[0] == signers[1] || signers[0] == signers[2] || signers[1] == signers[2]) {
            revert InvalidSignerConfiguration();
        }

        vm.startBroadcast(deployerPrivateKey);
        policyExecutor = new WithinPolicyExecutor(treasury, treasury);
        multisigExecutor = new WithinMultisigExecutor(signers, threshold);
        creditFacility =
            new WithinCreditFacility(usdc, borrower, address(multisigExecutor), creditLimit, creditRateBps, treasury);
        vm.stopBroadcast();

        console2.log("Network chain ID", block.chainid);
        console2.log("Deployer", deployer);
        console2.log("WithinPolicyExecutor", address(policyExecutor));
        console2.log("WithinMultisigExecutor", address(multisigExecutor));
        console2.log("WithinCreditFacility", address(creditFacility));
        console2.log("Credit limit (6-decimal USDC units)", creditLimit);
        console2.log(
            "Run scripts/sync-deployment-artifact.mjs after a successful broadcast to capture transaction hashes."
        );
    }
}
