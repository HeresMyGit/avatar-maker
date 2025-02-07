import { useState, useEffect } from 'react';
import BaseMferGallery from '../components/BaseMferGallery';
import { COLOR_MAP } from '../config/colors';

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

class Customs extends BaseMferGallery {
  constructor(props) {
    super('custom', 'https://cybermfers.sfo3.digitaloceanspaces.com/cybermfers/customs/public/');
    this.props = props;
  }

  render() {
    return super.render({
      title: "Custom mfers",
      themeColor: this.props.themeColor,
      searchPlaceholder: "Enter custom mfer ID",
      featuredModels: FEATURED_MODELS,
      marketplaceButtons: [
        {
          label: "Mint",
          url: "https://www.mferavatars.xyz",
          disabled: false
        },
        {
          label: "OpenSea",
          url: "https://opensea.io/collection/mfer-avatars-customs",
          disabled: false
        }
      ]
    });
  }
}

export default ({ themeColor }) => {
  const gallery = new Customs({ themeColor });
  return gallery.render();
}; 