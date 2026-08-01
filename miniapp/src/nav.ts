import type { TabId } from "./types";

export interface NavItem {
  id: TabId;
  label: string;
  icon: string;
}

export const navItems: NavItem[] = [
  {
    id: "home",
    label: "Home",
    icon: `${import.meta.env.BASE_URL}icons/home.svg`
  },
  {
    id: "library",
    label: "Library",
    icon: `${import.meta.env.BASE_URL}icons/library.svg`
  }
];
