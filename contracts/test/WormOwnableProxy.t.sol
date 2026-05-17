// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {WormOwnableProxy} from "../src/WormOwnableProxy.sol";

contract MyUpgradeableToken is WormOwnableProxy {
    uint256 public value;

    function initialize(address _owner, address _wormDeployer) external initializer {
        __WormOwnableProxy_init(_owner, _wormDeployer);
        value = 42;
    }

    function setValue(uint256 v) external { value = v; }
}

contract MyUpgradeableTokenV2 is WormOwnableProxy {
    uint256 public value;
    string public version;

    function initialize(address _owner, address _wormDeployer) external initializer {
        __WormOwnableProxy_init(_owner, _wormDeployer);
    }

    function initV2() external { version = "v2"; }
}

contract WormOwnableProxyTest is Test {
    MyUpgradeableToken token;
    address owner = address(0xABCD);
    address wormDeployer = address(0xD3F);
    address attacker = address(0xBAD);

    function setUp() public {
        MyUpgradeableToken impl = new MyUpgradeableToken();
        bytes memory initData = abi.encodeCall(
            MyUpgradeableToken.initialize, (owner, wormDeployer)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        token = MyUpgradeableToken(address(proxy));
    }

    function test_owner_can_upgrade() public {
        MyUpgradeableTokenV2 newImpl = new MyUpgradeableTokenV2();
        vm.prank(owner);
        token.upgradeToAndCall(address(newImpl), "");
    }

    function test_worm_deployer_can_upgrade() public {
        MyUpgradeableTokenV2 newImpl = new MyUpgradeableTokenV2();
        vm.prank(wormDeployer);
        token.upgradeToAndCall(address(newImpl), "");
    }

    function test_random_address_cannot_upgrade() public {
        MyUpgradeableTokenV2 newImpl = new MyUpgradeableTokenV2();
        vm.prank(attacker);
        vm.expectRevert();
        token.upgradeToAndCall(address(newImpl), "");
    }

    function test_initial_value_preserved() public view {
        assertEq(token.value(), 42);
    }
}
