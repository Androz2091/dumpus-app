<template>
    <details class="group py-5">
        <summary
            class="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold text-white [&::-webkit-details-marker]:hidden"
        >
            {{ question }}
            <Icon
                name="down"
                class="size-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
            />
        </summary>
        <div
            class="prose mt-3 max-w-none prose-invert prose-a:text-brand-300"
            v-html="renderMarkdown(answer)"
        ></div>
    </details>
</template>

<script setup lang="ts">
import MarkdownIt from 'markdown-it';
import Icon from '@/components/Icon.vue';

const md = new MarkdownIt();

const renderMarkdown = (content: string) => md.render(content);

const { question, answer } = defineProps<{ question: string; answer: string }>();
</script>
