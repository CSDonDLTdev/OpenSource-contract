pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/NoncesUpgradeable.sol";
import {IsinPermit} from "./IsinPermit.sol";

contract IsinEscrow is Initializable, OwnableUpgradeable, EIP712Upgradeable, NoncesUpgradeable {

    bytes32 private constant TRANSFER_ORDER_TYPEHASH =
    keccak256("TransferOrder(address sender,address receiver,address isinAddr,uint256 value,uint256 customValue)");
    bytes32 private constant CREATE_TRANSFER_ORDER_TYPEHASH =
    keccak256("CreateTransferOrder(TransferOrder data,uint256 nonce,uint256 deadline)TransferOrder(address sender,address receiver,address isinAddr,uint256 value,uint256 customValue)");
    bytes32 private constant ACCEPT_TRANSFER_ORDER_TYPEHASH = keccak256("AcceptTransferOrder(bytes32 orderHash,uint256 deadline)");
    bytes32 private constant REJECT_TRANSFER_ORDER_TYPEHASH = keccak256("RejectTransferOrder(bytes32 orderHash,uint256 deadline)");
    bytes32 private constant CANCEL_TRANSFER_ORDER_TYPEHASH = keccak256("CancelTransferOrder(bytes32 orderHash,uint256 deadline)");

    struct TransferOrder {
        address sender;
        address receiver;
        address isinAddr;
        uint256 value;
        uint256 customValue;
    }

    mapping(bytes32 => TransferOrder) private pendingOrders;

    error EscrowInvalidSigner(address signer, address sender);
    error EscrowExpiredSignature(uint256 deadline);

    error TransferOrderNotFound(bytes32 id);
    error TransferOrderAlreadyExists(bytes32 id);
    error TransferToEscrowFailed(address isinAddress, address from, uint256 value);
    error TransferFromEscrowFailed(address isinAddress, address to, uint256 value);

    event IsinTransferOrderCreated(bytes32 id, address indexed sender, address indexed receiver, address isinAddr, uint256 value, uint256 customValue);
    event IsinTransferOrderCancelled(bytes32 id, address indexed sender, address indexed receiver, address isinAddr, uint256 value, uint256 customValue);
    event IsinTransferOrderCompleted(bytes32 id, address indexed sender, address indexed receiver, address isinAddr, uint256 value, uint256 customValue);
    event IsinTransferOrderRejected(bytes32 id, address indexed sender, address indexed receiver, address isinAddr, uint256 value, uint256 customValue);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __Ownable_init(msg.sender);
        __EIP712_init_unchained("IsinEscrow", "1");
    }

    function _orderExists(bytes32 orderId) internal view returns (bool exists) {
        exists = (pendingOrders[orderId].sender != address(0));
    }

    function _assertOrderExists(bytes32 _orderHash) internal view {
        if (!_orderExists(_orderHash)) {
            revert TransferOrderNotFound(_orderHash);
        }
    }

    function _assertOrderNotExists(bytes32 _orderHash) internal view {
        if (_orderExists(_orderHash)) {
            revert TransferOrderAlreadyExists(_orderHash);
        }
    }

    modifier orderExists(bytes32 _orderHash) {
        _assertOrderExists(_orderHash);
        _;
    }

    function verifySignature(bytes32 structHash, address sender, uint8 v, bytes32 r, bytes32 s) internal view returns (bytes32 hash){
        hash = _hashTypedDataV4(structHash);

        address signer = ECDSA.recover(hash, v, r, s);
        if (signer != sender) {
            revert EscrowInvalidSigner(signer, sender);
        }
    }

    function encodeTransferOrder(TransferOrder calldata _data) public pure returns (bytes32) {
        return keccak256(abi.encode(
            TRANSFER_ORDER_TYPEHASH,
            _data.sender,
            _data.receiver,
            _data.isinAddr,
            _data.value,
            _data.customValue
        ));
    }

    function createTransferOrder(
        TransferOrder calldata _data,
        uint256 _deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
    external
    returns (bytes32 orderHash)
    {

        { // scope to avoid stack too deep errors
            if (block.timestamp > _deadline) {
                revert EscrowExpiredSignature(_deadline);
            }
            uint256 nonce = _useNonce(_data.sender);
            bytes32 transferOrderHash = encodeTransferOrder(_data);
            bytes32 messageHash = keccak256(
                abi.encode(
                    CREATE_TRANSFER_ORDER_TYPEHASH,
                    transferOrderHash,
                    nonce,
                    _deadline
                )
            );
            orderHash = verifySignature(messageHash, _data.sender, v, r, s);
        }

        _assertOrderNotExists(orderHash);

        IsinPermit(_data.isinAddr).assertTransferAllowed(_data.sender, _data.receiver, _data.value, address(this));

        // This contract becomes the temporary owner of the tokens
        if (!IERC20(_data.isinAddr).transferFrom(_data.sender, address(this), _data.value)) {
            revert TransferToEscrowFailed(_data.isinAddr, _data.sender, _data.value);
        }

        pendingOrders[orderHash] = _data;

        emit IsinTransferOrderCreated(orderHash, _data.sender, _data.receiver, _data.isinAddr, _data.value, _data.customValue);
    }

    function cancelTransferOrder(bytes32 _orderHash, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external orderExists(_orderHash) returns (bool)
    {
        TransferOrder memory transferOrder = pendingOrders[_orderHash];

        _resolveTransferOrder(_orderHash, deadline, v, r, s,
            transferOrder.sender, //verify request is signed by transfer sender
            transferOrder.sender,
            CANCEL_TRANSFER_ORDER_TYPEHASH); //send tokens back to sender

        emit IsinTransferOrderCancelled(_orderHash,
            transferOrder.sender,
            transferOrder.receiver,
            transferOrder.isinAddr,
            transferOrder.value,
            transferOrder.customValue);
        return true;
    }

    function acceptTransferOrder(bytes32 _orderHash, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
    external
    orderExists(_orderHash)
    returns (bool)
    {
        TransferOrder memory transferOrder = pendingOrders[_orderHash];

        _resolveTransferOrder(_orderHash, deadline, v, r, s,
            transferOrder.receiver, //verify request is signed by transfer receiver
            transferOrder.receiver,
            ACCEPT_TRANSFER_ORDER_TYPEHASH); //send tokens to receiver

        emit IsinTransferOrderCompleted(_orderHash,
            transferOrder.sender,
            transferOrder.receiver,
            transferOrder.isinAddr,
            transferOrder.value,
            transferOrder.customValue);
        return true;
    }

    function rejectTransferOrder(bytes32 _orderHash, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external
    orderExists(_orderHash)
    returns (bool)
    {
        TransferOrder memory transferOrder = pendingOrders[_orderHash];

        _resolveTransferOrder(_orderHash, deadline, v, r, s,
            transferOrder.receiver, //verify request is signed by transfer receiver
            transferOrder.sender,
            REJECT_TRANSFER_ORDER_TYPEHASH); //send tokens back to sender

        emit IsinTransferOrderRejected(_orderHash,
            transferOrder.sender,
            transferOrder.receiver,
            transferOrder.isinAddr,
            transferOrder.value,
            transferOrder.customValue);
        return true;
    }

    function _resolveTransferOrder(bytes32 _orderHash, uint256 deadline, uint8 v, bytes32 r, bytes32 s, address requestSigner, address transferTo, bytes32 typeHash)
    internal
    orderExists(_orderHash)
    {
        if (block.timestamp > deadline) {
            revert EscrowExpiredSignature(deadline);
        }
        bytes32 structHash = keccak256(abi.encode(typeHash, _orderHash, deadline));
        verifySignature(structHash, requestSigner, v, r, s);

        TransferOrder memory transferOrder = pendingOrders[_orderHash];
        IsinPermit(transferOrder.isinAddr).assertTransferAllowed(transferOrder.sender, transferOrder.receiver);
        delete pendingOrders[_orderHash];

        if (!IERC20(transferOrder.isinAddr).transfer(transferTo, transferOrder.value)) {
            revert TransferFromEscrowFailed(transferOrder.isinAddr, transferTo, transferOrder.value);
        }
    }

    function getTransferOrder(bytes32 _orderHash) public view returns (
        address sender,
        address receiver,
        address isinAddr,
        uint256 value,
        uint256 customValue
    )
    {
        if (_orderExists(_orderHash) == false)
            return (address(0), address(0), address(0), 0, 0);
        TransferOrder storage transferOrder = pendingOrders[_orderHash];
        return (
            transferOrder.sender,
            transferOrder.receiver,
            transferOrder.isinAddr,
            transferOrder.value,
            transferOrder.customValue
        );
    }

    function DOMAIN_SEPARATOR() external view virtual returns (bytes32) {
        return _domainSeparatorV4();
    }

}
