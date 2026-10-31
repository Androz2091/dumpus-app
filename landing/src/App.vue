<template>
    <div class="flex min-h-screen flex-col">
        <NavComponent />
        <main class="flex-1">
            <router-view />
        </main>
        <FooterComponent />
    </div>
</template>

<script setup lang="ts">
import NavComponent from '@/components/nav/Nav.vue';
import FooterComponent from '@/components/footer/Footer.vue';
</script>
