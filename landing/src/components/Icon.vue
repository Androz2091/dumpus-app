<template>
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        aria-hidden="true"
        :fill="brand ? 'currentColor' : 'none'"
        :stroke="brand ? 'none' : 'currentColor'"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <path :d="ICONS[name]" />
    </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ICONS, type IconName } from './icons';

const props = defineProps<{ name: IconName }>();

/** The two logos are filled shapes, the rest outlines. */
const brand = computed(() => props.name === 'discord' || props.name === 'github');
</script>
