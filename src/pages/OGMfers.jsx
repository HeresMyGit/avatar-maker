import { useState, useEffect } from 'react';
import MferGallery from '../components/MferGallery';
import { COLOR_MAP } from '../config/colors';

const OGMfers = ({ themeColor }) => {
  const [searchId, setSearchId] = useState('');
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch("https://cybermfers.sfo3.digitaloceanspaces.com/?prefix=cybermfers/public/metadata/");
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const keys = xmlDoc.getElementsByTagName("Key");
        const fetchedModels = [];

        // Only fetch first 20 models for performance
        for (let i = 0; i < Math.min(20, keys.length); i++) {
          const key = keys[i].textContent;
          if (!key.endsWith('.json')) continue;

          const id = key.split('/').pop().split('.')[0];
          const metadataUrl = `https://cybermfers.sfo3.digitaloceanspaces.com/${key}`;
          const metadataResponse = await fetch(metadataUrl);
          const metadata = await metadataResponse.json();

          const backgroundTrait = metadata.attributes.find(attr => attr.trait_type === "background");
          const bgColor = backgroundTrait ? COLOR_MAP[backgroundTrait.value] || "FFFFFF" : "FFFFFF";

          const glb = metadata.animation_url;
          const usdz = metadata.usdz_url;

          fetchedModels.push({
            id,
            glb,
            usdz,
            bgColor
          });
        }

        setModels(fetchedModels);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching models:', error);
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

  const handleSearch = async () => {
    try {
      const response = await fetch('https://cybermfers.sfo3.digitaloceanspaces.com/?prefix=cybermfers/public/metadata/');
      const data = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(data, 'application/xml');
      const files = xml.querySelectorAll('Key');
      let metadataFile;

      files.forEach(file => {
        if (file.textContent === `cybermfers/public/metadata/${searchId}.json`) {
          metadataFile = file.textContent;
        }
      });

      if (metadataFile) {
        window.location.href = `details?id=${searchId}`;
      } else {
        window.location.href = `details?id=${searchId}&needsMint=true`;
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <MferGallery
      title="OG mfers"
      themeColor={themeColor}
      models={models}
      loading={loading}
      searchId={searchId}
      setSearchId={setSearchId}
      onSearch={handleSearch}
      searchPlaceholder="Enter mfer ID"
      type="og"
      marketplaceButtons={[
        {
          label: "Mint",
          url: "https://www.mferavatars.xyz",
          disabled: false
        },
        {
          label: "OpenSea",
          url: "https://opensea.io/collection/mfer-avatars",
          disabled: false
        }
      ]}
    />
  );
};

export default OGMfers; 