import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { marathiInputPluginKey, type MarathiInputPluginState } from "./MarathiInputExtension";

/**
 * Subscribes a React component to the MarathiInputExtension's plugin
 * state so UI (suggestion popup, status pill, phonetic breakdown) can
 * re-render whenever the active word/buffer/suggestions change.
 */
export function useMarathiInputState(editor: Editor | null): MarathiInputPluginState | null {
  const [state, setState] = useState<MarathiInputPluginState | null>(null);

  useEffect(() => {
    if (!editor) return;

    const sync = () => {
      const pluginState = marathiInputPluginKey.getState(editor.state);
      setState(pluginState ? { ...pluginState } : null);
    };

    sync();
    editor.on("transaction", sync);
    editor.on("selectionUpdate", sync);
    return () => {
      editor.off("transaction", sync);
      editor.off("selectionUpdate", sync);
    };
  }, [editor]);

  return state;
}
