<template>
    <footer class="border-t border-gray-800/80">
        <div
            class="mx-auto flex max-w-6xl flex-col items-center gap-7 px-4 py-12 text-center sm:px-6"
        >
            <div class="flex gap-3">
                <a
                    v-for="link in social"
                    :key="link.href"
                    :href="link.href"
                    :aria-label="link.label"
                    class="flex size-11 items-center justify-center rounded-full bg-gray-800 text-brand-300 transition-colors hover:bg-gray-700 hover:text-brand-200"
                >
                    <Icon :name="link.icon" class="size-5" />
                </a>
            </div>
            <nav aria-label="Footer">
                <ul
                    class="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm font-medium text-brand-300"
                >
                    <li><router-link to="/" class="hover:text-brand-200">Home</router-link></li>
                    <li>
                        <a
                            href="https://github.com/Androz2091/dumpus-app/releases"
                            target="_blank"
                            rel="noopener"
                            class="hover:text-brand-200"
                            >What's New</a
                        >
                    </li>
                    <li>
                        <router-link to="/legal/privacy" class="hover:text-brand-200"
                            >Privacy Policy</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/legal/terms" class="hover:text-brand-200"
                            >Terms & Conditions</router-link
                        >
                    </li>
                    <li>
                        <router-link to="/legal/data-deletion" class="hover:text-brand-200"
                            >Data Deletion</router-link
                        >
                    </li>
                    <li><router-link to="/help" class="hover:text-brand-200">Help</router-link></li>
                </ul>
            </nav>
            <p class="text-sm text-gray-400">
                Made by
                <a href="https://github.com/Androz2091" class="text-brand-300 hover:text-brand-200"
                    >Androz2091</a
                >
                in France
            </p>
        </div>
    </footer>
</template>

<script setup lang="ts">
import Icon from '@/components/Icon.vue';
import { type IconName } from '@/components/icons';

const social: { href: string; label: string; icon: IconName }[] = [
    { href: 'https://androz2091.fr/discord', label: 'Our Discord server', icon: 'discord' },
    { href: 'https://github.com/Androz2091/dumpus-app', label: 'Dumpus on GitHub', icon: 'github' },
    { href: 'mailto:contact@dumpus.app', label: 'Email us', icon: 'envelope' },
];
</script>
