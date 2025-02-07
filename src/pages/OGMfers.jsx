import BaseMferGallery from '../components/BaseMferGallery';

class OGMfers extends BaseMferGallery {
  constructor(props) {
    super('og', 'https://cybermfers.sfo3.digitaloceanspaces.com/cybermfers/public/');
    this.props = props;
  }

  render() {
    return super.render({
      title: "OG mfers",
      themeColor: this.props.themeColor,
      searchPlaceholder: "Enter mfer ID",
      marketplaceButtons: [
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
      ]
    });
  }
}

export default ({ themeColor }) => {
  const gallery = new OGMfers({ themeColor });
  return gallery.render();
}; 