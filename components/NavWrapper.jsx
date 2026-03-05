"use client";
import { usePathname } from "next/navigation";
import SideNav from "./SideNav";

export default function NavWrapper({ children }) {
  const pathname = usePathname();
  const showNav = pathname !== "/";

  if (!showNav) return children;

  return (
    <div className="flex h-screen">
      <SideNav />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
