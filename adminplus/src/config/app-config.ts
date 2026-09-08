import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Adminplus",
  version: packageJson.version,
  copyright: `© ${currentYear}, Adminplus.`,
  meta: {
    title: "Adminplus - Splitwise Admin Panel",
    description: "Adminplus is the admin panel for splitwise, connected directly to the server/ API.",
  },
};
