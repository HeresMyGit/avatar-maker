import { useState, useEffect } from 'react';
import MferGallery from './MferGallery';
import { COLOR_MAP } from '../config/colors';

class BaseMferGallery {
  constructor(type, baseUrl) {
    this.type = type;
    this.baseUrl = baseUrl;
  }

  useGalleryState() {
    const [searchId, setSearchId] = useState('');
    const [models, setModels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTraits, setSelectedTraits] = useState({});
    const [filteredModels, setFilteredModels] = useState([]);

    useEffect(() => {
      this.fetchModels(setModels, setFilteredModels, setLoading);
    }, []);

    useEffect(() => {
      // Filter models based on selected traits
      const filtered = models.filter(model => {
        return Object.entries(selectedTraits).every(([category, selectedValues]) => {
          if (!selectedValues || selectedValues.length === 0) return true;
          const modelTraitValue = model.traits[category.toLowerCase()];
          return selectedValues.includes(modelTraitValue);
        });
      });
      
      setFilteredModels(filtered);
    }, [selectedTraits, models]);

    const handleTraitChange = (newTraits) => {
      setSelectedTraits(newTraits);
    };

    return {
      searchId,
      setSearchId,
      models,
      loading,
      filteredModels,
      selectedTraits,
      handleTraitChange
    };
  }

  async fetchModels(setModels, setFilteredModels, setLoading) {
    try {
      // Add headers for customs type to match original implementation
      const fetchOptions = this.type === 'custom' ? {
        headers: {
          'Accept': 'application/xml',
          'Origin': window.location.origin
        }
      } : {};

      // Only add 's' for customs type
      const typePrefix = this.type === 'og' 
        ? 'public' 
        : this.type === 'custom' 
          ? 'customs/public'
          : `${this.type}/public`;

      const response = await fetch(
        `https://cybermfers.sfo3.digitaloceanspaces.com/?prefix=cybermfers/${typePrefix}/metadata/`,
        fetchOptions
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
      console.log('XML Response:', xmlText.substring(0, 200)); // Debug log
      
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      
      // Check for parsing errors
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        console.error('XML parsing error:', parserError.textContent);
        throw new Error('XML parsing failed');
      }

      const keys = Array.from(xmlDoc.getElementsByTagName("Key"));
      console.log('Found keys:', keys.length); // Debug log
      
      const fetchedModels = [];

      // Only fetch first 20 models for performance
      for (let i = 0; i < Math.min(20, keys.length); i++) {
        const key = keys[i].textContent;
        // Skip non-metadata files based on type
        if (this.type === 'based') {
          // For based type, check if it's in the metadata directory
          if (!key.includes('/metadata/')) continue;
        } else {
          // For other types, check for .json extension
          if (!key.endsWith('.json')) continue;
        }

        const basename = key.split('.')[0];
        const id = basename.split('/').pop();

        const metadataUrl = `https://cybermfers.sfo3.digitaloceanspaces.com/${key}`;
        console.log('Fetching metadata from:', metadataUrl); // Debug log

        const metadataResponse = await fetch(metadataUrl, this.type === 'custom' ? {
          headers: {
            'Accept': 'application/json',
            'Origin': window.location.origin
          }
        } : {});

        if (!metadataResponse.ok) {
          console.error('Metadata fetch failed:', {
            status: metadataResponse.status,
            statusText: metadataResponse.statusText,
            url: metadataUrl
          });
          continue;
        }

        const metadata = await metadataResponse.json();
        console.log('Processing metadata for ID:', id, {
          name: metadata.name,
          hasAnimationUrl: !!metadata.animation_url,
          hasUsdzUrl: !!metadata.usdz_url,
          attributes: metadata.attributes
        }); // Debug log

        // Skip zerostate models for based type
        if (this.type === 'based') {
          const zerostate = metadata.attributes.find(attr => attr.trait_type === "zerostate");
          if (zerostate) continue;
        }

        // Skip custom models for customs type
        if (this.type === 'custom') {
          const custom = metadata.attributes.find(attr => attr.trait_type === "custom");
          if (custom || !metadata.animation_url || !metadata.usdz_url) continue;
        }

        const backgroundTrait = metadata.attributes.find(attr => attr.trait_type === "background");
        const bgColor = backgroundTrait ? COLOR_MAP[backgroundTrait.value] || "FFFFFF" : "FFFFFF";

        fetchedModels.push({
          id,
          glb: metadata.animation_url,
          usdz: metadata.usdz_url,
          bgColor,
          traits: metadata.attributes.reduce((acc, attr) => {
            acc[attr.trait_type.toLowerCase()] = attr.value.toLowerCase();
            return acc;
          }, {})
        });
        console.log('Added model:', id); // Debug log
      }

      console.log('Setting models:', fetchedModels.length); // Debug log
      setModels(fetchedModels);
      setFilteredModels(fetchedModels);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching models:', error);
      setLoading(false);
    }
  }

  async handleSearch(searchId) {
    try {
      const fetchOptions = this.type === 'custom' ? {
        headers: {
          'Accept': 'application/xml',
          'Origin': window.location.origin
        }
      } : {};

      // Only add 's' for customs type
      const typePrefix = this.type === 'og' 
        ? 'public' 
        : this.type === 'custom' 
          ? 'customs/public'
          : `${this.type}/public`;

      const response = await fetch(
        `https://cybermfers.sfo3.digitaloceanspaces.com/?prefix=cybermfers/${typePrefix}/metadata/`,
        fetchOptions
      );
      
      const data = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(data, "text/xml");
      const files = xml.querySelectorAll('Key');
      let metadataFile;

      files.forEach(file => {
        const expectedPath = this.type === 'og' 
          ? `cybermfers/public/metadata/${searchId}.json`
          : this.type === 'custom'
            ? `cybermfers/customs/public/metadata/${searchId}.json`
            : `cybermfers/based/public/metadata/${searchId}`;
        if (file.textContent === expectedPath) {
          metadataFile = file.textContent;
        }
      });

      if (metadataFile) {
        if (this.type === 'custom') {
          const metadataResponse = await fetch(`https://cybermfers.sfo3.digitaloceanspaces.com/${metadataFile}`, {
            headers: {
              'Accept': 'application/json',
              'Origin': window.location.origin
            }
          });
          const metadata = await metadataResponse.json();
          
          if (metadata.name !== 'custom mfer') {
            window.location.href = `details?id=${searchId}&custom=true`;
          } else {
            if (window.confirm('That avatar is not minted. Do you want to mint it?')) {
              window.location.href = 'https://www.mferavatars.xyz';
            }
          }
        } else {
          window.location.href = `details?id=${searchId}${this.type !== 'og' ? `&${this.type}=true` : ''}`;
        }
      } else {
        if (this.type === 'based') {
          if (window.confirm('That avatar is not minted. Do you want to mint some?')) {
            window.location.href = 'https://v2.scatter.art/based-mfer-avatars';
          }
        } else if (this.type === 'custom') {
          if (window.confirm('That avatar is not minted. Do you want to mint it?')) {
            window.location.href = 'https://www.mferavatars.xyz';
          }
        } else {
          window.location.href = `details?id=${searchId}&needsMint=true`;
        }
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }

  render(props) {
    const {
      searchId,
      setSearchId,
      loading,
      filteredModels,
      selectedTraits,
      handleTraitChange
    } = this.useGalleryState();

    return (
      <MferGallery
        {...props}
        models={filteredModels}
        loading={loading}
        searchId={searchId}
        setSearchId={setSearchId}
        onSearch={() => this.handleSearch(searchId)}
        type={this.type}
        selectedTraits={selectedTraits}
        onTraitChange={handleTraitChange}
      />
    );
  }
}

export default BaseMferGallery; 

