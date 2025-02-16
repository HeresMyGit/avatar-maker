export const TOKEN_INFO = {
  '0x26b831Cda0C7367124959B110a9E837772CBedF6': {
    name: 'Test Token',
    ticker: 'TEST'
  }
};

export const getTokenInfo = (address) => {
  return TOKEN_INFO[address] || { name: 'Unknown Token', ticker: '???' };
}; 