import BaseMferGallery from '../components/BaseMferGallery';

class PlaygroundGallery extends BaseMferGallery {
  constructor(props) {
    super('playground', 'https://sfo3.digitaloceanspaces.com/cybermfers/cybermfers/playground/public/');
    this.props = props;
  }

  render() {
    // Create an array of the first 70 IDs
    const firstSeventyIds = Array.from({ length: 70 }, (_, i) => i + 1);

    return super.render({
      title: "Playground Gallery",
      tagline: "experimental mfer avatars for testing and fun",
      themeColor: this.props.themeColor,
      searchPlaceholder: "Enter playground mfer ID",
      preloadedIds: firstSeventyIds,
      marketplaceButtons: [
        {
          label: "OpenSea",
          url: "#",
          disabled: true
        },
        {
          label: "Mint",
          url: "#",
          disabled: true
        }
      ]
    });
  }
}

export default ({ themeColor }) => {
  const gallery = new PlaygroundGallery({ themeColor });
  return gallery.render();
}; 