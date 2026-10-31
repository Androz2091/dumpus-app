import { Network } from "@capacitor/network";
import { isCapacitorSupported } from "~/capacitor/utils";
import type { CreateSlice } from ".";
import { emitter } from "~/utils/emitter";

const PRODUCT_SUPPORTER_KEY = "supporter";
export const PRODUCT_KEYS = [PRODUCT_SUPPORTER_KEY] as const;
export type ProductKey = (typeof PRODUCT_KEYS)[number];

// Google Play stops listing a refunded purchase. On iOS a refresh is a
// restore, which can ask for the Apple ID's password, so a refund there isn't
// looked for.
async function ownsSupporter(
  store: CdvPurchase.Store,
  googlePlay: CdvPurchase.Adapter,
) {
  // Play answers from a cache that it only syncs online.
  if (!(await Network.getStatus()).connected) return undefined;
  const error = await googlePlay.restorePurchases();
  return error ? undefined : store.owned(PRODUCT_SUPPORTER_KEY);
}

type State = {
  initialized: boolean;
  supported: boolean;
  products: CdvPurchase.Product[];
  restoring: boolean;
};

type Actions = {
  init: (props: { notify: (key: string) => void }) => Promise<void>;
  retryFailedSetup: () => void;
  restorePurchases: () => Promise<void>;
};

export type PurchasesSlice = State & Actions;

let setUpAgain: (() => void) | undefined;

export const createPurchasesSlice: CreateSlice<PurchasesSlice> = (
  set,
  get,
) => ({
  initialized: false,
  supported: false,
  products: [],
  restoring: false,
  init: async ({ notify }) => {
    function finish() {
      emitter.emit("purchases:initialized", true);
      set((state) => ({
        purchases: { ...state.purchases, initialized: true },
      }));
    }

    if (get().purchases.initialized) return;
    if (!isCapacitorSupported()) {
      return finish();
    }

    async function setUp(store: CdvPurchase.Store) {
      const { ErrorCode, ProductType, Platform } = window.CdvPurchase;

      // Order matters per the cordova-plugin-purchase v13 README:
      //   1. register products
      //   2. attach event handlers
      //   3. initialize the platform adapters
      // The previous order (initialize → register → update) worked on
      // Google Play but on the Apple App Store the adapter queries App
      // Store Connect for the products list at initialize time. With no
      // products registered yet, it queried for nothing, store.get(key)
      // returned undefined, and the dialog showed "Payments not supported"
      // even though the product (id "supporter", App Store Connect ID
      // 6451364202) was approved.
      store.register([
        {
          id: PRODUCT_SUPPORTER_KEY,
          type: ProductType.NON_CONSUMABLE,
          platform: Platform.GOOGLE_PLAY,
        },
        {
          id: PRODUCT_SUPPORTER_KEY,
          type: ProductType.NON_CONSUMABLE,
          platform: Platform.APPLE_APPSTORE,
        },
      ]);

      // Populate the products array reactively as the store loads them
      // from each platform. productUpdated fires once per product per
      // refresh; idempotent guard avoids duplicates.
      store.when().productUpdated((product) => {
        set((state) => {
          if (state.purchases.products.some((p) => p.id === product.id)) {
            return state;
          }
          return {
            purchases: {
              ...state.purchases,
              products: [...state.purchases.products, product],
            },
          };
        });
      });

      store.when().approved(async (transaction) => {
        // Can only be one product bought for now
        const productID = transaction.products[0].id as ProductKey;

        emitter.emit("purchases:transaction:approved", {
          key: productID,
        });
        // Read before closing the dialog: a purchase made in it gets a
        // thank-you, one approved in the background at start-up doesn't.
        const boughtInDialog = get().ui.showInAppPurchasesDialog;
        get().config.setPremium(true);
        get().ui.setShowInAppPurchasesDialog(false);
        if (boughtInDialog || get().purchases.restoring) {
          notify(productID);
        }
        await transaction.finish();
      });

      // The plugin reports a failed setup only here, and store.initialize()
      // then never settles: Google Play's adapter retries by waiting again on
      // the setup that failed. A store sets up only once, so setting up
      // again takes a new one.
      store.error((error) => {
        console.error("[purchases]", error.code, error.message);
        if (
          error.platform === Platform.GOOGLE_PLAY &&
          error.code === ErrorCode.SETUP
        ) {
          setUpAgain = () => {
            const { GooglePlay, Store } = window.CdvPurchase;
            // The adapter allows one instance.
            Reflect.deleteProperty(GooglePlay.Adapter, "_instance");
            window.CdvPurchase.store = new Store();
            setUp(window.CdvPurchase.store).catch((err) => {
              console.error("[purchases] init failed:", err);
            });
          };
        }
      });

      const errors = await store.initialize();

      set((state) => ({ purchases: { ...state.purchases, supported: true } }));

      const googlePlay = store.getAdapter(Platform.GOOGLE_PLAY);
      if (get().config.premium && googlePlay && errors.length === 0) {
        if ((await ownsSupporter(store, googlePlay)) === false) {
          get().config.setPremium(false);
        }
      }
    }

    try {
      await import("cordova-plugin-purchase");
      await setUp(window.CdvPurchase.store);
    } catch (err) {
      // Surface init failures in the device console so the next time
      // someone reports "Payments not supported" we have a real reason
      // to work from instead of guessing. supported stays false.
      console.error("[purchases] init failed:", err);
    }
    finish();
  },
  retryFailedSetup: () => {
    const retry = setUpAgain;
    setUpAgain = undefined;
    retry?.();
  },
  restorePurchases: async () => {
    set((state) => ({ purchases: { ...state.purchases, restoring: true } }));
    await window.CdvPurchase.store.restorePurchases();
    set((state) => ({ purchases: { ...state.purchases, restoring: false } }));
  },
});
