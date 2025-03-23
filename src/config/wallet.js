import { createWeb3Modal } from '@web3modal/wagmi/react'
import { defaultWagmiConfig } from '@web3modal/wagmi/react/config'
import { sepolia } from 'viem/chains'

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID

if (!projectId) {
  throw new Error('You need to provide VITE_WALLETCONNECT_PROJECT_ID env variable')
}

const metadata = {
  name: 'mfer Avatars',
  description: 'Create and mint your own mfer avatar',
  url: window.location.origin,
  icons: ['https://avatars.githubusercontent.com/u/37784886']
}

// Create wagmi config
const chains = [sepolia]
const config = defaultWagmiConfig({ 
  chains, 
  projectId, 
  metadata,
  enableWalletConnect: true,
  enableInjected: true,
  enableEIP6963: true,
  enableCoinbase: true
})

// Create web3modal
createWeb3Modal({
  wagmiConfig: config,
  projectId,
  chains,
  defaultChain: sepolia,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-font-family': 'SartoshiScript',
    '--w3m-accent-color': '#feb66e',
    '--w3m-background-color': '#13151a',
    '--w3m-overlay-background-color': 'rgba(19, 21, 26, 0.7)',
    '--w3m-button-border-radius': '12px',
    '--w3m-container-border-radius': '12px',
    '--w3m-wallet-icon-border-radius': '8px',
    '--w3m-text-big-bold-size': '1.4em',
    '--w3m-text-medium-regular-size': '1.4em'
  }
})

export { config } 