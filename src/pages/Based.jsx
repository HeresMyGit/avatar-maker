import { useState, useEffect } from 'react';
import MferGallery from '../components/MferGallery';
import { COLOR_MAP } from '../config/colors';

const Based = ({ themeColor }) => {
  const [searchId, setSearchId] = useState('');
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch("https://cybermfers.sfo3.digitaloceanspaces.com/?prefix=cybermfers/based/public/metadata/");
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const keys = xmlDoc.getElementsByTagName("Key");
        const fetchedModels = [];

        // Only fetch first 20 models for performance
        for (let i = 0; i < Math.min(20, keys.length); i++) {
          const key = keys[i].textContent;
          const basename = key.split('.')[0];
          const id = basename.split('/').pop();

          const metadataUrl = `https://cybermfers.sfo3.digitaloceanspaces.com/${key}`;
          const metadataResponse = await fetch(metadataUrl);
          const metadata = await metadataResponse.json();

          const zerostate = metadata.attributes.find(attr => attr.trait_type === "zerostate");
          if (zerostate) continue;

          const backgroundTrait = metadata.attributes.find(attr => attr.trait_type === "background");
          const bgColor = backgroundTrait ? COLOR_MAP[backgroundTrait.value] || "FFFFFF" : "FFFFFF";

          fetchedModels.push({
            id,
            glb: metadata.animation_url,
            usdz: metadata.usdz_url,
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
      const response = await fetch('https://cybermfers.sfo3.digitaloceanspaces.com/?prefix=cybermfers/based/public/metadata/');
      const data = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(data, 'application/xml');
      const files = xml.querySelectorAll('Key');
      let metadataFile;

      files.forEach(file => {
        if (file.textContent === `cybermfers/based/public/metadata/${searchId}`) {
          metadataFile = file.textContent;
        }
      });

      if (metadataFile) {
        window.location.href = `details?id=${searchId}&based=true`;
      } else {
        if (window.confirm('That avatar is not minted. Do you want to mint some?')) {
          window.location.href = 'https://v2.scatter.art/based-mfer-avatars';
        }
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <MferGallery
      title="Based mfers"
      themeColor={themeColor}
      models={models}
      loading={loading}
      searchId={searchId}
      setSearchId={setSearchId}
      onSearch={handleSearch}
      searchPlaceholder="Enter based mfer ID"
      type="based"
      marketplaceButtons={[
        {
          label: "OpenSea",
          url: "https://opensea.io/collection/based-mfer-avatars",
          disabled: false
        },
        {
          label: "Mint",
          url: "#",
          disabled: true
        }
      ]}
    />
  );
};

export default Based; 