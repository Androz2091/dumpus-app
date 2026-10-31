<template>
    <div class="flex flex-wrap items-center gap-3">
        <a
            v-for="badge in badges"
            :key="badge.href"
            :href="badge.href"
            class="rounded-[9px] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
        >
            <img
                :src="badge.src"
                :alt="badge.alt"
                :width="badge.width"
                height="54"
                class="block h-[50px] w-auto sm:h-[54px]"
            />
        </a>
    </div>
</template>

<script setup lang="ts">
import appStore from '@/assets/img/badges/appstore.svg';
import googlePlay from '@/assets/img/badges/playstore.svg';
import webApp from '@/assets/img/badges/web-app.svg';

const badges = [
    {
        href: 'https://apps.apple.com/us/app/dumpus-stats-for-discord/id6450952260',
        src: appStore,
        alt: 'Download on the App Store',
        width: 161,
    },
    {
        href: 'https://play.google.com/store/apps/details?id=app.dumpus.app',
        src: googlePlay,
        alt: 'Get it on Google Play',
        width: 180,
    },
    { href: 'https://web.dumpus.app', src: webApp, alt: 'Open the web app', width: 166 },
];
</script>
