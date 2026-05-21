import Image from "next/image";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { getAdminEmail } from "@/lib/admin";
import { LOGO_INTRINSIC, LOGO_SRC, brand } from "@/lib/brand";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/waitlist", label: "Waitlist" },
  { href: "/admin/merchants", label: "Merchants" },
  { href: "/admin/recoveries", label: "Recoveries" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const email = await getAdminEmail();

  return (
    <div
      className="min-h-full"
      style={{ background: brand.bg.base, color: brand.ink.primary }}
    >
      <header
        className="sticky top-0 z-10 backdrop-blur"
        style={{
          borderBottom: `1px solid ${brand.border.subtle}`,
          background: `${brand.bg.base}E6`,
        }}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/admin" className="flex items-center gap-3">
              <Image
                src={LOGO_SRC}
                alt="Dunner"
                width={LOGO_INTRINSIC.width}
                height={LOGO_INTRINSIC.height}
                style={{ height: "24px", width: "auto" }}
                priority
              />
              <span
                className="text-[10px] uppercase tracking-widest font-medium"
                style={{ color: brand.ink.muted }}
              >
                Admin
              </span>
            </Link>
            <nav className="flex items-center gap-5 text-sm">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="transition-colors hover:text-white"
                  style={{ color: brand.ink.secondary }}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-mono hidden md:inline"
              style={{ color: brand.ink.muted }}
            >
              {email}
            </span>
            <UserButton />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
