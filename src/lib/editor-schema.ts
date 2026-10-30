import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { MathBlock } from "@/components/MathBlock";
import { MentionInline } from "@/components/MentionInline";

/**
 * The editor's schema, and the one place new block or inline-content types get
 * registered.
 *
 * It lives outside the editor component on purpose. The schema's generics flow
 * into the type of every editor instance, so anything holding one — the
 * workspace shell, the AI panel, the post-AI cleanup pass — needs to name that
 * type. While the schema was a local in `Editor.tsx` those places all wrote
 * `BlockNoteEditor<never, never, never>` instead, which compiles against
 * anything and therefore checks nothing.
 */
export const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, math: MathBlock() },
  // `inlineContentSpecs` replaces the defaults rather than extending them, so
  // leaving out the spread would drop plain text and links from the schema —
  // which fails at runtime, somewhere unhelpful, rather than here.
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: MentionInline },
});

/**
 * An editor built from this schema.
 *
 * `BlockNoteEditor` is a phantom property: it carries the type, and reading it
 * at runtime is not the point.
 */
export type AppEditor = typeof schema.BlockNoteEditor;
