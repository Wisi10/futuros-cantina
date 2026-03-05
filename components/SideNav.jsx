"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingCart, Package, BarChart3 } from "lucide-react";

const NAV_ITEMS = [
  { href: "/pos", label: "Vender", icon: ShoppingCart },
  { href: "/inventario", label: "Inventario", icon: Package },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
];

export default function SideNav() {
  const pathname = usePathname();

  return (
    <nav className="w-16 bg-brand flex flex-col items-center py-4 gap-1 shrink-0">
      <div className="text-white/80 font-bold text-xs mb-4 tracking-wider">FS</div>

      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
              active
                ? "bg-white/20 text-white"
                : "text-white/50 hover:bg-white/10 hover:text-white/80"
            }`}
          >
            <Icon size={20} />
            <span className="text-[9px] font-medium leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
