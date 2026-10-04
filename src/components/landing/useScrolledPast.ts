import { useEffect, useState } from "react";

/** True once the page is scrolled past `ratio` of the viewport height (default: just after the hero). */
export function useScrolledPast(ratio = 0.9): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const update = () => setPast(window.scrollY > window.innerHeight * ratio);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [ratio]);

  return past;
}
