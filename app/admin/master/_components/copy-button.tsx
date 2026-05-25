"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type CopyButtonProps = {
  text: string;
  label?: string;
  className?: string;
  variant?: "primary" | "ghost";
};

export function CopyButton({
  text,
  label = "Kopyala",
  className = "",
  variant = "ghost",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Kopyalanacak metin:", text);
    }
  };

  const base =
    variant === "primary"
      ? "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 text-sm"
      : "inline-flex items-center gap-1.5 text-sm font-bold text-gray-700 hover:text-gray-900";

  return (
    <button type="button" onClick={() => void handleCopy()} className={`${base} ${className}`}>
      {copied ? <Check size={16} className={variant === "primary" ? "" : "text-green-600"} /> : <Copy size={16} />}
      {copied ? "Kopyalandı" : label}
    </button>
  );
}
