import { CreateSlice } from ".";
import { colors } from "#root/tailwind.config";

type State = {
  bottomNavHeight: number;
  bottomNavShown: boolean;
  showSharePopup: boolean;
  showInAppPurchasesDialog: boolean;
  safeAreaTopColor: string;
  redirectParam: string;
};

type Actions = {
  setBottomNavHeight: (v: number) => void;
  setBottomNavShown: (v: boolean) => void;
  setShowSharePopup: (v: boolean) => void;
  setShowInAppPurchasesDialog: (v: boolean) => void;
  setSafeAreaTopColor: (v: string) => void;
  setRedirectParam: (v: string) => void;
};

export type UISlice = State & Actions;

export const DEFAULT_SAFE_AREA_INSET_COLOR = colors.gray[950];

export const createUISlice: CreateSlice<UISlice> = (set) => ({
  bottomNavHeight: 0,
  bottomNavShown: false,
  showSharePopup: false,
  showInAppPurchasesDialog: false,
  safeAreaTopColor: DEFAULT_SAFE_AREA_INSET_COLOR,
  redirectParam: "/",
  setBottomNavHeight: (bottomNavHeight) =>
    set((state) => ({ ui: { ...state.ui, bottomNavHeight } })),
  setBottomNavShown: (bottomNavShown) =>
    set((state) => ({ ui: { ...state.ui, bottomNavShown } })),
  setShowSharePopup: (showSharePopup) =>
    set((state) => ({ ui: { ...state.ui, showSharePopup } })),
  setShowInAppPurchasesDialog: (showInAppPurchasesDialog) =>
    set((state) => ({ ui: { ...state.ui, showInAppPurchasesDialog } })),
  setSafeAreaTopColor: (safeAreaTopColor) =>
    set((state) => ({ ui: { ...state.ui, safeAreaTopColor } })),
  setRedirectParam: (redirectParam) =>
    set((state) => ({ ui: { ...state.ui, redirectParam } })),
});
