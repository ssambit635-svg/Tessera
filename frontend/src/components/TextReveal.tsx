import { createElement, useEffect, useRef, type ReactNode } from "react";

/* ============================================================================
   TextReveal — the grey→white reading gesture.

   Every word starts dim and lights up in order as the block travels up the viewport,
   so the sentence is "read" by the scroll itself. One shared rAF loop drives every
   instance on the page: no library, no per-word IntersectionObserver, no re-render
   (opacity is written straight to CSS variables on the word spans).

   Reduced motion: nothing animates, the text is simply at full strength.
   ========================================================================== */

interface Block {
  node: HTMLElement;
  words: HTMLElement[];
  dim: number;
}

const blocks = new Set<Block>();
let frame = 0;
let listening = false;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function paint() {
  frame = 0;
  const viewport = window.innerHeight || 800;

  blocks.forEach((block) => {
    const rect = block.node.getBoundingClientRect();
    // off-screen blocks cost nothing to skip
    if (rect.bottom < -200 || rect.top > viewport + 200) return;

    // 0 when the block's top is one viewport down, 1 once it is two-fifths up the screen
    const start = viewport * 1.02;
    const end = viewport * 0.42;
    const progress = clamp((start - rect.top) / Math.max(1, start - end), 0, 1);

    const count = block.words.length;
    // the head start means the first words are lit before the block is centred
    const cursor = progress * (count + 5);
    block.words.forEach((word, index) => {
      const lit = clamp((cursor - index) / 5, block.dim, 1);
      word.style.setProperty("--o", lit.toFixed(3));
    });
  });
}

function onScroll() {
  if (!frame) frame = requestAnimationFrame(paint);
}

function subscribe(block: Block) {
  blocks.add(block);
  if (!listening) {
    listening = true;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
  }
  onScroll();
}

function unsubscribe(block: Block) {
  blocks.delete(block);
  if (blocks.size === 0 && listening) {
    listening = false;
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
}

interface TextRevealProps {
  /** plain text — the component owns the word spans */
  text: string;
  className?: string;
  as?: "p" | "h2" | "h3" | "span" | "li" | "div";
  /** how dim an unread word is; 0.84 gives the subtle "coming up" effect */
  dim?: number;
  /** render at full strength (used for the hero, which is already on screen) */
  immediate?: boolean;
}

export function TextReveal({ text, className, as = "p", dim = 0.2, immediate = false }: TextRevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const words = Array.from(node.querySelectorAll<HTMLElement>("[data-word]"));

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || immediate) {
      words.forEach((word) => word.style.setProperty("--o", immediate ? "1" : "1"));
      return;
    }

    const block: Block = { node, words, dim };
    subscribe(block);
    return () => unsubscribe(block);
  }, [dim, immediate]);

  // the space lives *between* the spans: indentation inside an inline-block collapses
  const children: ReactNode[] = text.split(" ").flatMap((word, index) => [
    <span key={`${word}-${index}`} className="reveal-word" data-word>
      {word}
    </span>,
    " ",
  ]);

  return createElement(as, { className: className ? `reveal ${className}` : "reveal", ref }, children);
}
