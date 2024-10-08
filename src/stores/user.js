import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', () => {
  const userid = ref('')
  const setuserid = (id) => {
    userid.value = id
  }
  return { 
    userid,
    setuserid
  }
},{
  persist: true,
})