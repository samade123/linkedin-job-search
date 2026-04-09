<template>
    <aside class="lg:col-span-4 space-y-6">
        <!-- Manage Boards -->
        <div class="executive-panel p-6">
            <h3 class="text-sm font-bold mb-5 flex items-center gap-2 text-slate-900 border-b border-slate-100 pb-3">
                <svg class="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                Manage Job Boards
            </h3>
            <form @submit.prevent="addBoard" class="space-y-4">
                <div class="space-y-1.5">
                    <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Greenhouse Board ID</label>
                    <input type="text" v-model="boardIdInput" placeholder="e.g. chaosindustries" required class="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all">
                </div>
                <button type="submit" :disabled="isValidating" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 py-2.5 rounded-lg text-sm font-bold transition-all border border-slate-200 disabled:opacity-50">
                    <span v-if="isValidating" class="flex items-center justify-center gap-2">
                        <div class="animate-spin rounded-full h-3 w-3 border-b-2 border-slate-900"></div>
                        Validating...
                    </span>
                    <span v-else>Add Board</span>
                </button>
            </form>
        </div>

        <!-- Search Boards -->
        <div class="executive-panel p-6">
            <h3 class="text-sm font-bold mb-5 flex items-center gap-2 text-slate-900 border-b border-slate-100 pb-3">
                <svg class="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                Search Boards
            </h3>
            <form @submit.prevent="submitBoardSearch" class="space-y-5">
                <div class="space-y-1.5">
                    <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Select Board</label>
                    <select v-model="form.boardId" required class="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all">
                        <option value="" disabled v-if="myBoards.length === 0">No boards added</option>
                        <option v-for="b in myBoards" :key="b" :value="b">{{ b }}</option>
                    </select>
                </div>
                <div class="space-y-1.5">
                    <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">AI Intent Keyword</label>
                    <input type="text" v-model="form.keyword" required placeholder="e.g. Designer" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all">
                </div>
                <!-- Added Country Filter -->
                <div class="space-y-1.5">
                    <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Country (AI Filter)</label>
                    <input type="text" v-model="form.targetCountry" placeholder="e.g. USA" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all">
                </div>
                <button type="submit" :disabled="loading" class="w-full btn-primary py-2.5 text-sm font-bold flex items-center justify-center gap-2 mt-4">
                    <span>Target Search</span>
                </button>
            </form>
        </div>

        <div v-if="loading" class="executive-panel p-4 border-l-4 border-slate-900 flex items-center gap-3">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-900"></div>
            <span class="text-xs font-semibold text-slate-600">{{ statusText }}</span>
        </div>
    </aside>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const emit = defineEmits(['execute-board-search']);

const boardIdInput = ref('');
const myBoards = ref<string[]>([]);
const loading = ref(false);
const isValidating = ref(false);
const statusText = ref("");

const form = ref({
    boardId: "",
    keyword: "",
    targetCountry: "USA"
});

onMounted(() => {
    myBoards.value = JSON.parse(localStorage.getItem('myJobBoards') || '[]');
});

const addBoard = async () => {
    const newId = boardIdInput.value.trim().toLowerCase();
    if (!newId) return;
    if (myBoards.value.includes(newId)) {
        alert("Board ID already exists in your list.");
        return;
    }

    isValidating.value = true;
    try {
        // Quick check to see if board exists and has jobs
        const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${newId}/jobs`);
        if (!res.ok) {
            throw new Error(`Board not found (Status: ${res.status})`);
        }
        const data = await res.json();
        // Greenhouse might return success but with a message if it's not a real board
        if (data.error || !data.jobs) {
             throw new Error("Invalid Greenhouse Board structure detected.");
        }

        myBoards.value.push(newId);
        localStorage.setItem('myJobBoards', JSON.stringify(myBoards.value));
        boardIdInput.value = '';
    } catch (err: any) {
        alert(`Failed to validate board: ${err.message}`);
    } finally {
        isValidating.value = false;
    }
};

const submitBoardSearch = () => {
    if (!form.value.boardId) return;
    emit('execute-board-search', form.value, (isLoading: boolean, text: string) => {
        loading.value = isLoading;
        statusText.value = text;
    });
};
</script>
