import { useState, useEffect } from 'react';
import MferGallery from '../components/MferGallery';
import { COLOR_MAP } from '../config/colors';
import { TRAIT_CATEGORIES } from '../config/traits';

// Helper function to get a random item from an array
const getRandomItem = (array) => {
  return array[Math.floor(Math.random() * array.length)];
};

// Generate random traits but force green background
const generateGreenTraits = () => {
  const traits = {
    background: 'green', // Force green background
    type: getRandomItem(TRAIT_CATEGORIES.type.options).id,
    eyes: getRandomItem(TRAIT_CATEGORIES.eyes.options).id,
    mouth: getRandomItem(TRAIT_CATEGORIES.mouth.options).id,
    headphones: getRandomItem(TRAIT_CATEGORIES.headphones.options).id,
    shoes_and_gloves: 'green' // Force green shoes and gloves
  };

  // Add optional traits with 50% chance each
  const optionalCategories = Object.entries(TRAIT_CATEGORIES)
    .filter(([key]) => !['background', 'type', 'eyes', 'mouth', 'headphones', 'shoes_and_gloves'].includes(key));

  optionalCategories.forEach(([category, data]) => {
    if (Math.random() > 0.5) {
      traits[category] = getRandomItem(data.options).id;
    }
  });

  return traits;
};

const FEATURED_MODELS = [
  { 
    id: "mcx", 
    color: "green",
    glb: "https://cybermfers.sfo3.digitaloceanspaces.com/cybermfers/customs/public/assets/glb/mcx.glb",
    usdz: "https://cybermfers.sfo3.digitaloceanspaces.com/cybermfers/customs/public/assets/usdz/mcx.usdz"
  },
  { 
    id: "pcmfer", 
    color: "purple",
    glb: "https://cybermfers.sfo3.digitaloceanspaces.com/cybermfers/customs/public/assets/glb/pcmfer.glb",
    usdz: "https://cybermfers.sfo3.digitaloceanspaces.com/cybermfers/customs/public/assets/usdz/pcmfer.usdz"
  },
  { 
    id: "s34n", 
    color: "yellow",
    glb: "https://cybermfers.sfo3.digitaloceanspaces.com/cybermfers/customs/public/assets/glb/s34n.glb",
    usdz: "https://cybermfers.sfo3.digitaloceanspaces.com/cybermfers/customs/public/assets/usdz/s34n.usdz"
  }
];

const Customs = ({ themeColor }) => {
  const [searchId, setSearchId] = useState('');
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTraits, setSelectedTraits] = useState(null);

  useEffect(() => {
    let mounted = true;

    const fetchModels = async () => {
      try {
        const response = await fetch(
          "https://cybermfers.sfo3.digitaloceanspaces.com/?prefix=cybermfers/customs/public/metadata/",
          {
            headers: {
              'Accept': 'application/xml',
              'Origin': window.location.origin
            }
          }
        );
        
        if (!response.ok) {
          console.error('Response not ok:', {
            status: response.status,
            statusText: response.statusText,
            url: response.url
          });
          throw new Error(`Network response was not ok: ${response.status}`);
        }
        
        const xmlText = await response.text();
        console.log('XML Response:', xmlText.substring(0, 200) + '...'); // Log first 200 chars of response
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        // Check for parsing errors
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
          console.error('XML parsing error:', parserError.textContent);
          throw new Error('XML parsing failed');
        }
        
        const keys = Array.from(xmlDoc.getElementsByTagName("Key"));
        console.log('Found keys:', keys.length);
        
        const fetchedModels = [];

        for (const key of keys) {
          if (!mounted) return;

          const keyContent = key.textContent;
          const basename = keyContent.split('.')[0];
          const ext = keyContent.split('.')[1];

          if (ext === 'json') {
            const metadataUrl = `https://cybermfers.sfo3.digitaloceanspaces.com/${keyContent}`;
            console.log('Fetching metadata from:', metadataUrl);
            
            const metadataResponse = await fetch(metadataUrl, {
              headers: {
                'Accept': 'application/json',
                'Origin': window.location.origin
              }
            });
            
            if (!metadataResponse.ok) {
              console.error('Metadata fetch failed:', {
                status: metadataResponse.status,
                statusText: metadataResponse.statusText,
                url: metadataUrl
              });
              continue;
            }
            
            const metadata = await metadataResponse.json();
            const id = basename.split('/').pop();
            
            console.log('Processing metadata for ID:', id, {
              name: metadata.name,
              hasAnimationUrl: !!metadata.animation_url,
              hasUsdzUrl: !!metadata.usdz_url,
              attributes: metadata.attributes
            });

            const custom = metadata.attributes.find(attr => attr.trait_type === "custom");

            if (metadata.animation_url && metadata.usdz_url && !custom) {
              const backgroundTrait = metadata.attributes.find(attr => attr.trait_type === "background");
              const bgColor = backgroundTrait ? COLOR_MAP[backgroundTrait.value] || "FFFFFF" : "FFFFFF";

              fetchedModels.push({
                id,
                glb: metadata.animation_url,
                usdz: metadata.usdz_url,
                bgColor
              });
              console.log('Added model:', id);
            }
          }
        }

        if (mounted) {
          console.log('Setting models:', fetchedModels.length);
          setModels(fetchedModels);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error in fetchModels:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchModels();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSearch = async () => {
    try {
      const response = await fetch('https://cybermfers.sfo3.digitaloceanspaces.com/?prefix=cybermfers/customs/public/metadata/');
      const data = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(data, "text/xml");
      const files = xml.querySelectorAll('Key');
      let metadataFile;

      files.forEach(file => {
        if (file.textContent === `cybermfers/customs/public/metadata/${searchId}.json`) {
          metadataFile = file.textContent;
        }
      });

      if (metadataFile) {
        const metadataResponse = await fetch(`https://cybermfers.sfo3.digitaloceanspaces.com/${metadataFile}`);
        const metadata = await metadataResponse.json();
        
        if (metadata.name !== 'custom mfer') {
          window.location.href = `details?id=${searchId}&custom=true`;
        } else {
          if (window.confirm('That avatar is not minted. Do you want to mint it?')) {
            window.location.href = 'https://www.mferavatars.xyz';
          }
        }
      } else {
        if (window.confirm('That avatar is not minted. Do you want to mint it?')) {
          window.location.href = 'https://www.mferavatars.xyz';
        }
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleGoGreen = () => {
    const greenTraits = generateGreenTraits();
    setSelectedTraits(greenTraits);
    // You might want to add additional logic here to update the preview or do something with the traits
    console.log('Generated green traits:', greenTraits);
  };

  return (
    <MferGallery
      title="Custom mfers"
      themeColor={themeColor}
      models={models}
      loading={loading}
      searchId={searchId}
      setSearchId={setSearchId}
      onSearch={handleSearch}
      searchPlaceholder="Enter custom mfer ID"
      type="custom"
      featuredModels={FEATURED_MODELS}
      onGoGreen={handleGoGreen}
      selectedTraits={selectedTraits}
    />
  );
};

export default Customs; 