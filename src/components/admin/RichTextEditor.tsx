"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Strikethrough,
    List,
    ListOrdered,
    Link2,
    Link2Off,
    Quote,
    Minus,
    Undo2,
    Redo2,
    Heading2,
    Heading3,
    Pilcrow,
    RemoveFormatting,
} from "lucide-react";

interface RichTextEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    className?: string;
}

/**
 * WYSIWYG editor built on Tiptap/ProseMirror.
 *
 * Outputs plain HTML that matches what the public /privacy and /terms pages
 * expect, so the live preview and the rendered site stay in sync.
 *
 * The editor content is styled with the same `.legal-prose` class the public
 * pages use, so what the admin sees while editing is what visitors see.
 */
export function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [2, 3] },
                // StarterKit enables horizontalRule, blockquote, lists by default
            }),
            Underline,
            Link.configure({
                openOnClick: false,
                autolink: true,
                HTMLAttributes: {
                    rel: "noopener noreferrer",
                    class: "text-brand-blue underline underline-offset-2",
                },
            }),
            Placeholder.configure({
                placeholder: placeholder ?? "Start writing…",
            }),
        ],
        content: value,
        editorProps: {
            attributes: {
                class: "legal-prose min-h-[520px] max-w-none outline-none",
            },
        },
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        // Tiptap requires this to avoid SSR hydration warnings in Next.js
        immediatelyRender: false,
    });

    // Keep the editor in sync when `value` is replaced externally (e.g. after a
    // .docx upload or an initial fetch). Only reset when the incoming HTML
    // differs from what the editor already holds to avoid losing the caret.
    useEffect(() => {
        if (!editor) return;
        if (editor.getHTML() === value) return;
        editor.commands.setContent(value || "", { emitUpdate: false });
    }, [value, editor]);

    if (!editor) {
        return (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 min-h-[560px] text-sm text-gray-400">
                Loading editor…
            </div>
        );
    }

    return (
        <div className={cn("bg-white border border-gray-200 rounded-2xl overflow-hidden", className)}>
            <Toolbar editor={editor} />
            <div className="px-5 py-4">
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Toolbar                                                            */
/* ------------------------------------------------------------------ */

function Toolbar({ editor }: { editor: Editor }) {
    return (
        <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-gray-100 bg-gray-50/80 sticky top-0 z-10">
            {/* Text style */}
            <Btn
                active={editor.isActive("paragraph")}
                onClick={() => editor.chain().focus().setParagraph().run()}
                title="Paragraph"
            >
                <Pilcrow className="w-4 h-4" />
            </Btn>
            <Btn
                active={editor.isActive("heading", { level: 2 })}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                title="Heading 2"
            >
                <Heading2 className="w-4 h-4" />
            </Btn>
            <Btn
                active={editor.isActive("heading", { level: 3 })}
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                title="Heading 3"
            >
                <Heading3 className="w-4 h-4" />
            </Btn>

            <Divider />

            {/* Inline */}
            <Btn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (⌘B)">
                <Bold className="w-4 h-4" />
            </Btn>
            <Btn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (⌘I)">
                <Italic className="w-4 h-4" />
            </Btn>
            <Btn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (⌘U)">
                <UnderlineIcon className="w-4 h-4" />
            </Btn>
            <Btn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
                <Strikethrough className="w-4 h-4" />
            </Btn>

            <Divider />

            {/* Lists */}
            <Btn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bulleted list">
                <List className="w-4 h-4" />
            </Btn>
            <Btn
                active={editor.isActive("orderedList")}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                title="Numbered list"
            >
                <ListOrdered className="w-4 h-4" />
            </Btn>
            <Btn
                active={editor.isActive("blockquote")}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                title="Quote"
            >
                <Quote className="w-4 h-4" />
            </Btn>
            <Btn
                onClick={() => editor.chain().focus().setHorizontalRule().run()}
                title="Horizontal rule"
            >
                <Minus className="w-4 h-4" />
            </Btn>

            <Divider />

            {/* Link */}
            <Btn
                active={editor.isActive("link")}
                onClick={() => {
                    const prev = editor.getAttributes("link").href as string | undefined;
                    const url = window.prompt("Link URL (leave blank to remove):", prev ?? "https://");
                    if (url === null) return;
                    if (url.trim() === "") {
                        editor.chain().focus().extendMarkRange("link").unsetLink().run();
                        return;
                    }
                    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
                }}
                title="Add / edit link"
            >
                <Link2 className="w-4 h-4" />
            </Btn>
            {editor.isActive("link") && (
                <Btn
                    onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
                    title="Remove link"
                >
                    <Link2Off className="w-4 h-4" />
                </Btn>
            )}

            <Divider />

            {/* Clear formatting */}
            <Btn
                onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
                title="Clear formatting"
            >
                <RemoveFormatting className="w-4 h-4" />
            </Btn>

            <div className="flex-1" />

            {/* Undo/Redo */}
            <Btn
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
                title="Undo (⌘Z)"
            >
                <Undo2 className="w-4 h-4" />
            </Btn>
            <Btn
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
                title="Redo (⌘⇧Z)"
            >
                <Redo2 className="w-4 h-4" />
            </Btn>
        </div>
    );
}

function Btn({
    children,
    onClick,
    active,
    disabled,
    title,
}: {
    children: React.ReactNode;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    title?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            aria-label={title}
            aria-pressed={active}
            className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                active
                    ? "bg-[#0A4FE8] text-white"
                    : "text-gray-600 hover:text-[#0A4FE8] hover:bg-white",
                disabled && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-gray-600"
            )}
        >
            {children}
        </button>
    );
}

function Divider() {
    return <span className="w-px h-5 bg-gray-200 mx-1" />;
}
