interface Window {
  setPremium: (v: boolean) => void;
}

// The plugin's types only declare the `CdvPurchase` global its import sets,
// so `tsc` refuses the import itself as "not a module".
declare module "cordova-plugin-purchase";
