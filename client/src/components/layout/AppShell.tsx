import { useEffect, useState } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { TaskPanelHost } from "../tasks/TaskPanel";

const KEY = "fibnk:sidebar-collapsed"; // non-sensitive UI preference

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  // Capture the matched route element now: a bare Outlet element inside AnimatePresence would render the NEW page in the
  // exiting wrapper, then mount it a second time when the exit animation ends (losing any state opened in between).
  const outlet = useOutlet();
  const reduce = useReducedMotion();

  useEffect(() => {
    try {
      localStorage.setItem(KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className={`min-h-full bg-white [--sb:0px] ${collapsed ? "lg:[--sb:76px]" : "lg:[--sb:264px]"}`}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <TopBar onOpenMenu={() => setMobileOpen(true)} sidebarWidth={0} />
      <main className="min-h-screen pt-[84px] transition-[padding] duration-200 sm:pt-[92px]" style={{ paddingLeft: "var(--sb)" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            className="mx-auto w-full max-w-[1500px] px-3 pb-12 pt-4 sm:px-6 sm:pt-6"
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>
      <TaskPanelHost />
    </div>
  );
}
