<template>
  <div class="header-button" >
    <el-upload
        class="upload-demo"
        action="#"
        :http-request = "handleRequest"
        :show-file-list= false
        multiple
    >
        <el-button class="upload-button" type="primary">文件上传</el-button>
    </el-upload>
    <el-button @click= "changecreateFolder" type="success" icon="DocumentAdd">
        新建文件夹
    </el-button>
    <el-button @click= "deletefile" type="info" icon="DeleteFilled">
        批量删除
    </el-button>
    <el-button type="warning" icon="Rank">
        批量移动
    </el-button>
    <el-input
        style="width: 240px;margin-left: 18px;"
        placeholder="请输入文件名搜索"
        class="fileselect"
    />
    <i @click="getFileList" class="iconfont icon-shuaxin" style="margin-left: 18px;cursor: pointer;"></i>
    </div>
</template>

<script setup>
  import { ref } from 'vue'
  import instance from '@/utils/http'
  import SparkMD5 from 'spark-md5';
  import { FileList, MovieFileList, uploadFile, checkfile, uploadchuckfile, merge, CheckChunk, DeleteFile, createFolder } from '@/apis/file'
  import { useProgressStore } from '@/stores/loadprogress'
  import { useUserStore } from '@/stores/user';
  import { useFileStore } from '@/stores/file';
  import { useOptionStore } from '@/stores/option';
  import { storeToRefs } from 'pinia'
  const userStore = useUserStore()
  const fileStore = useFileStore()
  const ProgressStore = useProgressStore()
  const OptionStore = useOptionStore()
  const {options} = storeToRefs(OptionStore)
  const {loadProgress} = storeToRefs(ProgressStore)
  const { userid } = storeToRefs(userStore)
  const { fileid } = storeToRefs(fileStore)
  const chunksize = 10 * 1024 * 1024
  const test = ref({
    userId: userid,
    fileId: fileid
  })
  const emit = defineEmits(['create-folder','delete-file','get-filelist'])
  const changecreateFolder = () => {
    emit('create-folder')
  }
  const play = () => {
    console.log('成功调用')
  }
  const deletefile = () => {
    emit('delete-file')
  }
  const getFileList = () => {
    emit('get-filelist')
  }
  //上传文件
  const handleRequest = async (options) => {
    //计算文件的md5值
    const UploadFile = options.file
    const fileMd5 = await getUploadFileMD5(UploadFile);
    if(OptionStore.getelementindex(UploadFile.uid)===-1){
      OptionStore.addelement({'uid':UploadFile.uid,'option':options})
    }
    //计算文件大小
    const fileSize = UploadFile.size
    //检查文件是否存在
    const checkfiledata = new FormData() 
    checkfiledata.append('fileMd5', fileMd5)
    checkfiledata.append('FileSize', fileSize)
    checkfiledata.append('Filename', UploadFile.name)
    checkfiledata.append('pid',test.value.fileId)
    // checkfiledata.append('userId',test.value.userId)
    const chekFile = await checkfile(checkfiledata);
    //文件已上传，返回，实现秒传
    if(chekFile.data==="文件已上传"){
        return false
    }
    // 可以设置大于多少兆可以分片上传，否则走普通上传
    if (fileSize <= chunksize) {
        const formData = new FormData()
        formData.append('file', UploadFile)
        formData.append('pid',test.value.fileId)
        formData.append('fileMd5',fileMd5)
        if(ProgressStore.getelement(UploadFile.uid)===-1){
          console.log('添加progress')
          const itemprogress = {'uid':UploadFile.uid,'filename':UploadFile.name,'progress':0,'pause':false}
          ProgressStore.addelement(itemprogress)
        }
        await instance.post('http://localhost:8081/file/upload',formData,{
            headers: {
            "Content-Type": "multipart/form-data",
            },
            onUploadProgress: (ProgressEvent) => {
            ProgressStore.setprogress(UploadFile.uid,Math.round((ProgressEvent.loaded/ProgressEvent.total)*100))
            }
        }).then(response => {  
            console.log('File uploaded successfully');  
        })
        getFileList()
    }else{
        //大于10M进行分片上传
        //计算分片数量
        const chunkCount = Math.ceil(fileSize / chunksize)
        if(ProgressStore.getelement(UploadFile.uid)===-1){
          const itemprogress = {'uid':UploadFile.uid,'filename':UploadFile.name,'progress':0,'pause':false}
          ProgressStore.addelement(itemprogress)
        }
        for (var i = 0; i < chunkCount; i++) {
            if(ProgressStore.getfilepuse(UploadFile.uid)===true){
              return
            }
            //检查每一片分片是否已上传，若已上传则不在上传，实现断点传续
            const checkchunkdata = new FormData()
            checkchunkdata.append("fileMd5",fileMd5)
            checkchunkdata.append("chunk",i)
            const checkchunk = await CheckChunk(checkchunkdata);
            if(checkchunk.data==="分块已存在"){
              continue
            }
            console.log(i)
            //分片开始位置
            let start = i * chunksize
            //分片结束位置
            let end = Math.min(fileSize, start + chunksize)
            //取文件指定范围内的byte，从而得到分片数据
            let _chunkFile = UploadFile.slice(start, end)
            let formdata = new FormData()
            formdata.append('fileMd5', fileMd5)
            formdata.append('chunkNumber', i)
            formdata.append('file', _chunkFile)
            // 通过await实现顺序上传
            await uploadchuckfile(formdata)
            ProgressStore.setprogress(UploadFile.uid,Math.floor(((i+1)/chunkCount)*100))
        }
        //分块上传完毕，合并分块
        const formdata = new FormData()
        formdata.append('fileMd5', fileMd5)
        formdata.append('chunkCount', chunkCount)
        formdata.append('filename', UploadFile.name)
        formdata.append('pid',test.value.fileId)
        await merge(formdata)
        //上传完成，重新加载文件列表
        getFileList()
    }
  }
  const getUploadFileMD5 = (file) => {
      return new Promise((resolve, reject) => {
        const fileReader = new FileReader();

        fileReader.onload = () => {
          const arrayBuffer = fileReader.result;
          const md5Hash = SparkMD5.ArrayBuffer.hash(arrayBuffer);
          resolve(md5Hash);
        };

        fileReader.onerror = (error) => {
          reject(error);
        };

        fileReader.readAsArrayBuffer(file);
      });
  }
  defineExpose({
  	  handleRequest,
      play
	})
</script>

<style lang="scss" scoped>
  .header-button {
        margin-top: 18px;
        display: flex;
        align-items: center;
        .upload-demo {
        padding-right: 18px;
        }
    }
</style>