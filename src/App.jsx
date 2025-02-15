import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { WagmiConfig } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from './config/wallet'
import Layout from './components/Layout';
import Home from './pages/Home';
import Playground from './pages/Playground';
import OGMfers from './pages/OGMfers';
import Customs from './pages/Customs';
import Based from './pages/Based';
import MyMfers from './pages/MyMfers';
import PlaygroundGallery from './pages/PlaygroundGallery';
import Details from './pages/Details';

// Create a client
const queryClient = new QueryClient()

function App() {
  const [themeColor, setThemeColor] = useState('#feb66e');

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiConfig config={config}>
        <Router basename="/avatar-maker">
          <Routes>
            <Route path="/" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Home themeColor={themeColor} /></Layout>} />
            <Route path="/playground" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Playground themeColor={themeColor} setThemeColor={setThemeColor} /></Layout>} />
            <Route path="/og" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><OGMfers themeColor={themeColor} /></Layout>} />
            <Route path="/customs" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Customs themeColor={themeColor} /></Layout>} />
            <Route path="/based" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Based themeColor={themeColor} /></Layout>} />
            <Route path="/my" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><MyMfers themeColor={themeColor} /></Layout>} />
            <Route path="/playground-gallery" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><PlaygroundGallery themeColor={themeColor} /></Layout>} />
            <Route path="/details" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Details themeColor={themeColor} /></Layout>} />
            <Route path="*" element={<Layout themeColor={themeColor} onThemeChange={setThemeColor}><Home themeColor={themeColor} /></Layout>} />
          </Routes>
        </Router>
      </WagmiConfig>
    </QueryClientProvider>
  );
}

export default App;
