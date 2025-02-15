// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract MferAvatarPlayground is ERC721, ERC721URIStorage, Ownable, Pausable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    // Base URI for token metadata
    string private _baseTokenURI;

    // Payment token configuration
    mapping(address => uint256) public paymentAmounts;
    address[] public acceptedTokens;
    uint256 public ethPrice;

    // Free mint allowances
    mapping(address => uint256) public freeMints;

    // Events
    event PaymentTokenUpdated(address indexed token, uint256 amount);
    event PaymentTokenRemoved(address indexed token);
    event EthPriceUpdated(uint256 newPrice);
    event FreeMintAllowanceUpdated(address indexed recipient, uint256 amount);
    event FreeMintUsed(address indexed user, uint256 tokenId);
    event BaseURIUpdated(string newBaseURI);

    constructor() ERC721("mfer avatar playground", "MFER") Ownable(msg.sender) {
        // Set initial ETH price (0.1 ETH)
        ethPrice = 0.1 ether;
    }

    // Override _baseURI() to return the base URI for token metadata
    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    // Admin: Set base URI for token metadata
    function setBaseURI(string memory newBaseURI) public onlyOwner {
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    // Mint with ETH
    function mint() public payable whenNotPaused returns (uint256) {
        // Check if sender has free mints
        if (freeMints[msg.sender] > 0) {
            return _mintFree(msg.sender);
        }

        require(msg.value >= ethPrice, "Insufficient ETH sent");
        
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        _safeMint(msg.sender, newTokenId);

        // Refund excess ETH if any
        if (msg.value > ethPrice) {
            (bool success, ) = payable(msg.sender).call{value: msg.value - ethPrice}("");
            require(success, "ETH refund failed");
        }

        return newTokenId;
    }

    // Mint with ERC20 token
    function mintWithToken(address token, uint256 amount) public whenNotPaused returns (uint256) {
        // Check if sender has free mints
        if (freeMints[msg.sender] > 0) {
            return _mintFree(msg.sender);
        }

        require(paymentAmounts[token] > 0, "Token not accepted");
        require(amount >= paymentAmounts[token], "Insufficient token amount");
        
        // Transfer tokens from user
        IERC20(token).transferFrom(msg.sender, address(this), paymentAmounts[token]);
        
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        _safeMint(msg.sender, newTokenId);

        // Refund excess tokens if any
        if (amount > paymentAmounts[token]) {
            IERC20(token).transfer(msg.sender, amount - paymentAmounts[token]);
        }

        return newTokenId;
    }

    // Internal function for free minting
    function _mintFree(address to) internal returns (uint256) {
        require(freeMints[to] > 0, "No free mints available");
        
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        _safeMint(to, newTokenId);
        
        freeMints[to]--;
        emit FreeMintUsed(to, newTokenId);
        
        return newTokenId;
    }

    // Admin: Mint for free (owner only)
    function adminMint() public onlyOwner returns (uint256) {
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        _safeMint(msg.sender, newTokenId);
        
        emit FreeMintUsed(msg.sender, newTokenId);
        return newTokenId;
    }

    // Admin: Mint to a specific address for free
    function adminMintTo(address to) public onlyOwner returns (uint256) {
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        _safeMint(to, newTokenId);
        
        emit FreeMintUsed(to, newTokenId);
        return newTokenId;
    }

    // Admin: Grant free mints to an address
    function grantFreeMints(address recipient, uint256 amount) public onlyOwner {
        freeMints[recipient] = amount;
        emit FreeMintAllowanceUpdated(recipient, amount);
    }

    // Admin: Revoke free mints from an address
    function revokeFreeMints(address recipient) public onlyOwner {
        freeMints[recipient] = 0;
        emit FreeMintAllowanceUpdated(recipient, 0);
    }

    // Admin: Pause contract
    function pause() public onlyOwner {
        _pause();
    }

    // Admin: Unpause contract
    function unpause() public onlyOwner {
        _unpause();
    }

    // Admin: Add/Update payment token
    function setPaymentToken(address token, uint256 amount) public onlyOwner {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");

        if (paymentAmounts[token] == 0) {
            acceptedTokens.push(token);
        }
        paymentAmounts[token] = amount;
        
        emit PaymentTokenUpdated(token, amount);
    }

    // Admin: Remove payment token
    function removePaymentToken(address token) public onlyOwner {
        require(paymentAmounts[token] > 0, "Token not in list");
        
        paymentAmounts[token] = 0;
        
        // Remove from acceptedTokens array
        for (uint i = 0; i < acceptedTokens.length; i++) {
            if (acceptedTokens[i] == token) {
                acceptedTokens[i] = acceptedTokens[acceptedTokens.length - 1];
                acceptedTokens.pop();
                break;
            }
        }
        
        emit PaymentTokenRemoved(token);
    }

    // Admin: Update ETH price
    function setEthPrice(uint256 newPrice) public onlyOwner {
        ethPrice = newPrice;
        emit EthPriceUpdated(newPrice);
    }

    // View: Get list of accepted tokens
    function getPaymentTokens() public view returns (address[] memory) {
        return acceptedTokens;
    }

    // View: Get payment amount for a token
    function getPaymentAmount(address token) public view returns (uint256) {
        if (token == address(0)) {
            return ethPrice;
        }
        return paymentAmounts[token];
    }

    // Admin: Withdraw ETH
    function withdrawEth() public onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "ETH withdrawal failed");
    }

    // Admin: Withdraw ERC20 tokens
    function withdrawTokens(address token) public onlyOwner {
        require(token != address(0), "Invalid token address");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        
        IERC20(token).transfer(owner(), balance);
    }

    // Required overrides
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
} 