// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../../contracts/Paycrest.sol";
import "../../contracts/PaycrestSettingManager.sol";
import "../../contracts/mocks/MockUSDC.sol";
import "../../lib/forge-std/src/console.sol";

contract PayCrestTest is Test {
    Paycrest paycrest;
    MockUSDC usdc;
    MockUSDC usdt;

    address aggregator = makeAddr("aggregator");
    address sender = makeAddr("sender");

    function setUp() public {
        usdc = new MockUSDC();
        usdt = new MockUSDC();
        paycrest = new Paycrest(address(usdc));

        vm.prank(sender);
        usdc.mint(200e18);
    }

    function testOwnnerFunctions() public {
        // test with a valid token
        paycrest.settingManagerBool("token", address(usdt), true);
        //re-set the valid token
        paycrest.settingManagerBool("token", address(usdt), false);
        // test expected failure for invalid address
        vm.expectRevert(PaycrestSettingManager.ThrowZeroAddress.selector);
        // test expected failure for invalid code
        paycrest.settingManagerBool("token", address(0), false);

        PaycrestSettingManager.Institution[]
            memory inst = new PaycrestSettingManager.Institution[](4);
        inst[0] = PaycrestSettingManager.Institution("001", "firstbank");
        inst[1] = PaycrestSettingManager.Institution("002", "Zenith");
        inst[2] = PaycrestSettingManager.Institution("003", "GTB");
        inst[3] = PaycrestSettingManager.Institution("004", "Access");

        paycrest.setSupportedInstitutions("NGN001", inst);

        paycrest.getSupportedInstitutions("NGN001");
        paycrest.getSupportedName("firstbank");
        // test updateProtocolFees function
        // paycrest.updateProtocolFees(10000, 1000, 1000);
        address feeReceipient = makeAddr("feeReceipient");
        address aggregatorReceipient = makeAddr("aggregatorReceipient");
        address stakeReceipient = makeAddr("stakeReceipient");

        paycrest.updateFeeRecipient("fee", feeReceipient);
    }

    function testCreateOrder() public {
        testOwnnerFunctions();
        // update the aggregator to receive the fund
        paycrest.updateFeeRecipient("aggregator", aggregator);

        vm.startPrank(sender);
        usdc.approve(address(paycrest), 200e18);
        bytes32 id = paycrest.createOrder(
            address(usdc),
            200e18,
            address(aggregator),
            0,
            "001",
            "0x"
        );
        vm.stopPrank();

        vm.startPrank(aggregator);
        paycrest.refund(bytes32(id));
        vm.stopPrank();

        paycrest._calculateFees(id, 5);

        paycrest.getFeeDetails();
    }
}
