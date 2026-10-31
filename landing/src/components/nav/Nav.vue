<template>
    <header class="relative z-20">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
            <router-link to="/" class="flex items-center gap-3">
                <img
                    src="@/assets/img/appicon.png"
                    alt=""
                    width="40"
                    height="40"
                    class="size-10 rounded-[22%] shadow-[0_0_0_2px_rgba(255,255,255,0.12)]"
                />
                <span class="text-lg leading-tight font-bold tracking-tight">
                    Dumpus
                    <span class="hidden font-medium text-gray-400 sm:inline">
                        · Stats for Discord</span
                    >
                </span>
            </router-link>
            <nav aria-label="Main">
                <ul class="flex items-center gap-5 text-sm font-medium text-gray-300 sm:gap-7">
                    <li>
                        <router-link to="/help" class="transition-colors hover:text-white"
                            >Help</router-link
                        >
                    </li>
                    <li>
                        <a
                            href="https://github.com/Androz2091/dumpus-app/releases"
                            target="_blank"
                            rel="noopener"
                            class="transition-colors hover:text-white"
                            >What's New</a
                        >
                    </li>
                    <li>
                        <a
                            href="https://github.com/Androz2091/dumpus-app"
                            target="_blank"
                            rel="noopener"
                            aria-label="Dumpus on GitHub"
                            class="block transition-colors hover:text-white"
                        >
                            <Icon name="github" class="size-5" />
                        </a>
                    </li>
                </ul>
            </nav>
        </div>
    </header>
</template>

<script setup lang="ts">
import Icon from '@/components/Icon.vue';
</script>
