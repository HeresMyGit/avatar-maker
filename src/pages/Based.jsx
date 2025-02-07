import BaseMferGallery from '../components/BaseMferGallery';

class Based extends BaseMferGallery {
  constructor(props) {
    super('based', 'https://cybermfers.sfo3.digitaloceanspaces.com/cybermfers/based/public/');
    this.props = props;
  }

  render() {
    return super.render({
      title: "Based mfers",
      themeColor: this.props.themeColor,
      searchPlaceholder: "Enter based mfer ID",
      marketplaceButtons: [
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
      ]
    });
  }
}

export default ({ themeColor }) => {
  const gallery = new Based({ themeColor });
  return gallery.render();
}; 