<template>
    <section class="relative isolate overflow-hidden">
        <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10">
            <div
                class="absolute inset-0 bg-[radial-gradient(60%_55%_at_75%_30%,rgba(14,165,233,0.35),transparent_70%)]"
            ></div>
            <img
                src="@/assets/img/facets.svg"
                alt=""
                class="absolute inset-0 size-full mask-b-from-40% mask-b-to-100% object-cover"
            />
        </div>
        <div
            class="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pt-14 lg:pb-24"
        >
            <div class="text-center lg:text-left">
                <img
                    src="@/assets/img/appicon.png"
                    alt=""
                    width="88"
                    height="88"
                    class="mx-auto size-20 rounded-[22%] shadow-[0_0_0_2px_rgba(255,255,255,0.12),0_20px_50px_rgba(14,165,233,0.25)] sm:size-22 lg:mx-0"
                />
                <p class="mt-8 eyebrow justify-center lg:justify-start">Stats for Discord · Free</p>
                <h1
                    class="mt-4 text-5xl leading-[0.95] font-black tracking-[-0.035em] sm:text-6xl lg:text-7xl"
                >
                    Your Discord, <span class="text-brand-200">unpacked.</span>
                </h1>
                <p
                    class="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-gray-300 sm:text-xl lg:mx-0"
                >
                    Wish you had a Discord version of Spotify Wrapped? Dumpus reads the data package
                    Discord gives you, shows who you talk to, where you hang out and when you're
                    online, and turns it into cards to share, any time of the year.
                </p>
                <StoreBadges class="mt-8 justify-center lg:justify-start" />
                <p class="mt-4 text-sm text-gray-400">
                    Also for
                    <a
                        href="https://github.com/Androz2091/dumpus-app/releases/latest"
                        class="font-semibold text-brand-300 hover:text-brand-200"
                        >Windows and macOS</a
                    >.
                </p>
            </div>
            <div class="relative mx-auto aspect-[10/9] w-full max-w-[540px]">
                <picture v-for="card in hero" :key="card.name">
                    <source :srcset="card.webp" type="image/webp" />
                    <img
                        :src="card.png"
                        :alt="card.alt"
                        width="720"
                        height="1280"
                        :loading="card.name === '01-cover' ? 'eager' : 'lazy'"
                        decoding="async"
                        class="absolute h-auto rounded-[4%/2.25%] shadow-[0_30px_80px_rgba(2,6,23,0.7),0_0_0_1px_rgba(255,255,255,0.06)]"
                        :class="card.place"
                    />
                </picture>
            </div>
        </div>
    </section>

    <section id="cards" class="py-16 sm:py-24">
        <div class="mx-auto max-w-6xl px-4 sm:px-6">
            <p class="eyebrow">New in 2.0</p>
            <h2 class="mt-4 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
                Your recap, ready to share
            </h2>
            <p class="mt-5 max-w-2xl text-lg leading-relaxed text-gray-300">
                Eight story cards and a square summary, for the time range you pick: the last 4
                weeks, 6 months, year, or your whole history. Dumpus draws them on your device, at
                full story size, ready to post.
            </p>
        </div>
        <div class="relative mt-10">
            <ul
                ref="strip"
                class="flex snap-x snap-mandatory gutter-strip [scrollbar-width:none] items-center gap-4 overflow-x-auto pb-4 sm:gap-6 [&::-webkit-scrollbar]:hidden"
                aria-label="Share cards"
            >
                <li
                    v-for="card in cards"
                    :key="card.name"
                    class="w-[62vw] max-w-[270px] shrink-0 snap-center sm:w-64 sm:snap-start lg:w-72 lg:max-w-none"
                >
                    <picture>
                        <source :srcset="card.webp" type="image/webp" />
                        <img
                            :src="card.png"
                            :alt="card.alt"
                            width="720"
                            :height="card.square ? 720 : 1280"
                            loading="lazy"
                            decoding="async"
                            class="h-auto w-full shadow-[0_20px_50px_rgba(2,6,23,0.6),0_0_0_1px_rgba(255,255,255,0.06)]"
                            :class="card.square ? 'rounded-[4%]' : 'rounded-[4%/2.25%]'"
                        />
                    </picture>
                </li>
            </ul>
            <div
                class="mx-auto mt-4 flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"
            >
                <p class="text-sm text-gray-500">Cards from a made-up account.</p>
                <div class="hidden gap-2 sm:flex">
                    <button
                        v-for="step in steps"
                        :key="step"
                        type="button"
                        :aria-label="step < 0 ? 'Previous cards' : 'Next cards'"
                        class="flex size-11 items-center justify-center rounded-full bg-gray-800 text-white transition-colors hover:bg-gray-700"
                        @click="scrollStrip(step)"
                    >
                        <Icon :name="step < 0 ? 'left' : 'right'" class="size-5" />
                    </button>
                </div>
            </div>
        </div>
    </section>

    <section class="border-y border-gray-800/70 bg-gray-900/40 py-16 sm:py-24">
        <div class="mx-auto max-w-6xl px-4 sm:px-6">
            <p class="eyebrow">In the app</p>
            <h2 class="mt-4 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
                Everything in your package
            </h2>
            <ul class="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-8 lg:grid-cols-4">
                <li v-for="shot in shots" :key="shot.name" class="text-center">
                    <picture>
                        <source :srcset="shot.webp" type="image/webp" />
                        <img
                            :src="shot.png"
                            :alt="shot.alt"
                            width="600"
                            height="1298"
                            loading="lazy"
                            decoding="async"
                            class="mx-auto h-auto w-full max-w-[280px]"
                        />
                    </picture>
                    <p class="mt-4 font-semibold text-gray-200">{{ shot.caption }}</p>
                </li>
            </ul>
        </div>
    </section>

    <section class="py-16 sm:py-24">
        <div class="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 class="text-4xl font-black tracking-[-0.03em] sm:text-5xl">
                What Dumpus finds in it
            </h2>
            <ul class="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                <li v-for="feature in features" :key="feature.title" class="flex gap-4">
                    <span
                        class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300 ring-1 ring-brand-400/20"
                    >
                        <Icon :name="feature.icon" class="size-6" />
                    </span>
                    <div>
                        <h3 class="text-lg font-bold">{{ feature.title }}</h3>
                        <p class="mt-1.5 leading-relaxed text-gray-400">{{ feature.text }}</p>
                    </div>
                </li>
            </ul>
        </div>
    </section>

    <section class="pb-16 sm:pb-24">
        <div
            class="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.3fr] lg:items-center lg:gap-16"
        >
            <div>
                <p class="eyebrow">Privacy</p>
                <h2 class="mt-4 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
                    Your data stays yours
                </h2>
                <p class="mt-5 text-lg leading-relaxed text-gray-300">
                    Your data package says a lot about you. Here is what happens to it, and the code
                    that does it is open source.
                </p>
                <p class="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-semibold text-brand-300">
                    <router-link to="/legal/privacy" class="hover:text-brand-200"
                        >Privacy Policy</router-link
                    >
                    <router-link to="/legal/data-deletion" class="hover:text-brand-200"
                        >Data Deletion</router-link
                    >
                    <a href="https://github.com/Androz2091/dumpus-app" class="hover:text-brand-200"
                        >Source code</a
                    >
                </p>
            </div>
            <ul class="grid gap-4">
                <li
                    v-for="point in privacy"
                    :key="point.icon"
                    class="flex gap-4 rounded-2xl bg-gray-900 p-5 ring-1 ring-gray-800"
                >
                    <Icon :name="point.icon" class="mt-0.5 size-6 shrink-0 text-brand-300" />
                    <p class="leading-relaxed text-gray-300">{{ point.text }}</p>
                </li>
            </ul>
        </div>
    </section>

    <section class="pb-20 sm:pb-28">
        <div class="mx-auto max-w-6xl px-4 sm:px-6">
            <div
                class="relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-brand-700 via-brand-900 to-gray-950 px-6 py-14 text-center ring-1 ring-brand-400/20 sm:px-12 sm:py-20"
            >
                <img
                    src="@/assets/img/facets.svg"
                    alt=""
                    aria-hidden="true"
                    class="absolute inset-0 -z-10 size-full object-cover opacity-80"
                />
                <h2 class="text-4xl font-black tracking-[-0.03em] sm:text-5xl">Get your recap</h2>
                <p class="mx-auto mt-4 max-w-xl text-lg text-brand-100">
                    Free on iOS, Android and the web. Ask Discord for your data package, and Dumpus
                    does the rest.
                </p>
                <StoreBadges class="mt-8 justify-center" />
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Icon from '@/components/Icon.vue';
import { type IconName } from '@/components/icons';
import StoreBadges from '@/components/StoreBadges.vue';

const webp = import.meta.glob<string>('../assets/img/{cards,app}/*.webp', {
    eager: true,
    import: 'default',
});
const png = import.meta.glob<string>('../assets/img/{cards,app}/*.png', {
    eager: true,
    import: 'default',
});
const image = (path: string) => ({
    webp: webp[`../assets/img/${path}.webp`],
    png: png[`../assets/img/${path}.png`],
});

// The app's own cards and screens, on a made-up account.
const cards = [
    ['01-cover', 'Cover card: 7 years of Discord, unpacked, for Nova'],
    ['02-messages', 'Messages card: 177,088 messages, 64 a day since 2019, busiest in April 2020'],
    [
        '03-top-dms',
        'Top DMs card: Maya first with 15,118 messages, then Jordan, Theo, Noor and Riley',
    ],
    [
        '04-top-servers',
        'Top servers card: Snack Club first with 27,311 messages, then Late Night Lofi, Cozy Corner, Game Night and Pixel Garden',
    ],
    [
        '05-peak-hour',
        'Peak hour card: 10 PM, a night owl, with 57% of messages between 9 PM and 4 AM',
    ],
    ['06-time', 'Time card: 4,215 hours on Discord, 16,210 app opens, 432 hours in voice'],
    ['07-habits', 'Little habits card: reactions, edited messages, notifications and more'],
    ['08-summary', 'Summary card: the main numbers, top DMs and top servers'],
    ['09-summary-square', 'Square summary card: the main numbers, top DMs and top servers'],
].map(([name, alt]) => ({
    name,
    alt,
    square: name.includes('square'),
    ...image(`cards/${name}`),
}));

const byName = (name: string) => cards.find((card) => card.name === name)!;
const hero = [
    { ...byName('03-top-dms'), place: 'top-[9%] left-[1%] z-10 w-[40%] -rotate-[8deg]' },
    { ...byName('05-peak-hour'), place: 'top-[9%] right-[1%] z-10 w-[40%] rotate-[8deg]' },
    { ...byName('01-cover'), place: 'top-0 left-[27%] z-20 w-[46%]' },
];

const shots = [
    [
        'overview',
        'Your numbers at a glance',
        'The overview: messages sent, most active DMs and servers',
    ],
    ['top', 'Top DMs, servers and channels', 'The list of top DMs, with their message counts'],
    [
        'stats',
        'Your activity over time',
        'Charts of messages and minutes on Discord over the years',
    ],
    [
        'details',
        'A page for each of them',
        "A friend's page: messages, top chat hour and sentiment",
    ],
].map(([name, caption, alt]) => ({ name, caption, alt, ...image(`app/${name}`) }));

const features: { icon: IconName; title: string; text: string }[] = [
    {
        icon: 'calendar',
        title: 'Four time ranges',
        text: 'Every stat for the last 4 weeks, 6 months, year, or your whole history, to see how your Discord changed.',
    },
    {
        icon: 'users',
        title: 'Your people and places',
        text: 'Your top DMs, servers and channels, with a page for each and a sentiment score for your DMs.',
    },
    {
        icon: 'chart',
        title: 'Activity over time',
        text: "Messages and minutes on Discord over the years, and the hours of the day you're most active.",
    },
    {
        icon: 'clock',
        title: 'Time on Discord',
        text: 'Hours in the app and in voice, your average session, who you call the most and the devices you use.',
    },
    {
        icon: 'sparkles',
        title: 'The small stuff',
        text: 'Reactions, edited messages, notifications clicked, captchas, crashes, Nitro ads seen. Find out!',
    },
    {
        icon: 'stack',
        title: 'All your packages',
        text: 'Add your old and new data packages, and switch between them.',
    },
];

const privacy: { icon: IconName; text: string }[] = [
    {
        icon: 'download',
        text: "You paste the link from Discord's email. Our server downloads your package, turns it into a database, and deletes the zip.",
    },
    {
        icon: 'key',
        text: "It stores that database encrypted with a key from your link, and deletes the link once processing starts, so what it keeps can't be read without your link. The app decrypts it on your device.",
    },
    {
        icon: 'trash',
        text: 'Delete your package in the settings, and it is gone from your device and our server. Encrypted copies are deleted after 90 days anyway.',
    },
    {
        icon: 'server',
        text: 'Dumpus is open source, and you can run your own server instead of ours.',
    },
];

const strip = ref<HTMLUListElement | null>(null);
const steps = [-1, 1] as const;

function scrollStrip(step: -1 | 1) {
    const element = strip.value;
    if (!element) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollBy({
        left: step * element.clientWidth * 0.8,
        behavior: reduce ? 'auto' : 'smooth',
    });
}
</script>
