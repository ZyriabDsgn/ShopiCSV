import React, { useState, useRef, useEffect, useCallback } from 'react';
import store from 'store2';
import Papa from 'papaparse';
import getDateLocale from '../utils/tools/getDateLocale.utils';
import getDataType from '../utils/tools/getDataType.utils';
import saveFile from '../utils/tools/buckaroo/saveFile.utils';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useConfirm } from 'material-ui-confirm';
import { useAuth0 } from '@auth0/auth0-react';
import { MtAlert, MtAlertElement } from '../components/MtAlert/MtAlert';
import MtAppBar from '../components/MtAppBar/MtAppBar';
import {
  MtEditorContent,
  MtEditorContentElement,
} from '../components/MtEditorContent/MtEditorContent';
import { MtFieldElement } from '../components/MtEditorField/MtEditorField';
import { Page } from '@shopify/polaris';
import { RowData, TranslatableResourceType } from '../definitions/custom';

export default function Translator() {
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [hasClosed, setHasClosed] = useState(false);
  const [file, setFile] = useState<File | null>(null); // uploaded file or data of restored session (name, size, lastModified, lastSave?, content?)
  const fileRef = useRef<File | null>(null); // used for direct update/access when saving
  const [displayCol, setDisplayCol] = useState<number[]>([]);
  const [fileData, setFileData] = useState<RowData[]>([]);
  const [displayedData, setDisplayedData] = useState<RowData[]>([]); // used for rendering content
  const [filteredDataIds, setFilteredDataIds] = useState<number[]>([]);
  const [filteredDataTypes, setFilteredTypes] = useState<
    TranslatableResourceType[]
  >([]);
  const [numOfDisplayedFields, setNumOfDisplayedFields] = useState(0);
  const parsedData = useRef<RowData[]>([]); // stores the file's content, used for data manipulation (saving, downloading, etc)
  const renderedFields = useRef<React.RefObject<MtFieldElement>[]>([]);
  const alertEl = useRef<MtAlertElement>(null!);
  const contentRef = useRef<MtEditorContentElement>(null!);

  const confirmationDialog = useConfirm();
  const { t, i18n } = useTranslation();
  const { getAccessTokenSilently } = useAuth0();

  function displayAlert(message: string, isError: boolean = false) {
    alertEl.current.show({ message, isError });
  }

  const hasEdited = useCallback((): [boolean, string[]] => {
    let hasEdit = false;
    const editedFieldsKid: string[] = [];
    for (let field of renderedFields.current) {
      if (field.current) {
        const kid = field.current.getKid();
        const tmpKid = kid.split('-');
        const fieldVal = field.current.getValue();
        const savedVal =
          parsedData.current[parseFloat(tmpKid[0])].data[parseFloat(tmpKid[1])];
        if (fieldVal !== savedVal) {
          editedFieldsKid.push(kid);
          hasEdit = true;
        }
      } else {
        console.log('Error while checking for edits: field is null');
      }
    }
    return [hasEdit, editedFieldsKid];
  }, []);

  async function handleCloseFile(deleteFile = false) {
    let isDeleting = false;
    setIsLoading(true);
    if (deleteFile) {
      try {
        await confirmationDialog({
          allowClose: false,
          title: t('CloseFileDialog.title'),
          description: t('CloseFileDialog.description'),
          confirmationText: t('CloseFileDialog.yes'),
          cancellationText: t('CloseFileDialog.no'),
          confirmationButtonProps: {
            color: 'error',
            disableElevation: true,
            variant: 'contained',
          },
          cancellationButtonProps: {
            disableElevation: true,
            variant: 'contained',
          },
        });
        isDeleting = true;
      } catch {
        isDeleting = false;
      }
    }

    if (isDeleting) {
      store.remove('fileData');
    }

    contentRef.current.resetPagination();
    parsedData.current = [];
    fileRef.current = null;
    setFile(null);
    setFileData([]);
    setDisplayedData([]);
    setHasClosed(true);

    setIsEditing(false);
    setIsLoading(false);
  }

  const handleSave = useCallback(
    async (displayMsg = false, isAutosave = false) => {
      if (parsedData.current.length > 0 && renderedFields.current) {
        setIsLoading(true);
        const [hasEdit, editedFieldsKid] = hasEdited();
        const editedFields = renderedFields.current.filter(
          (f) => f.current && editedFieldsKid.includes(f.current.getKid())
        );

        if (hasEdit) {
          for (let field of editedFields) {
            if (field.current) {
              const kid = field.current.getKid().split('-');
              parsedData.current[parseFloat(kid[0])].data[parseFloat(kid[1])] =
                field.current.getValue() as string;
            }
          }

          const token = await getAccessTokenSilently();

          await saveFile({
            file: parsedData.current,
            fileName: fileRef.current!.name,
            token,
          });

          //setFileData([...parsedData.current]);
          store.remove('fileData');
          store.set('fileData', {
            content: parsedData.current,
            name: fileRef.current?.name,
            size: fileRef.current?.size,
            lastModified: fileRef.current?.lastModified,
            savedAt: new Date().toLocaleString(),
          });

          if (displayMsg) {
            displayAlert(`${t('Save.success')} 💾`);
          }
        } else {
          if (displayMsg && !isAutosave) {
            displayAlert(`${t('Save.upToDate')} 👍`);
          }
        }
        setIsLoading(false);
        return hasEdit;
      }
      return false;
    },
    [getAccessTokenSilently, hasEdited, t]
  );

  async function processFileUpload(file: File) {
    if (isEditing) {
      await handleSave(true, true);
    }

    setIsLoading(true);
    setIsEditing(false);
    setFile(file);
    fileRef.current = file;
    parsedData.current = [];
    let index = 0;

    Papa.parse<string[]>(file, {
      worker: true,
      step: (row: any) => {
        const dt: RowData = { data: row.data, id: index };

        parsedData.current.push(dt);
        index++;
      },
      complete: async () => {
        displayAlert(`${t('Upload.success')} 🤓`);
        setDisplayedData([...parsedData.current]);
        setFileData([...parsedData.current]);
        store.remove('fileData');
        store.set('fileData', {
          content: parsedData.current,
          name: fileRef.current?.name,
          size: fileRef.current?.size,
          lastModified: fileRef.current?.lastModified,
          savedAt: new Date().toLocaleString(),
        });
        setIsLoading(false);
        setIsEditing(true);
      },
    });
  }

  async function handleDrop(files: File[]) {
    await processFileUpload(files[0]);
  }

  async function handleUpload(
    e: React.ChangeEvent<HTMLInputElement> | { target: DataTransfer }
  ) {
    if (e?.target?.files) {
      handleCloseFile();
      await processFileUpload(e.target.files[0]);
    }
  }

  async function handleDownload() {
    if (parsedData.current) {
      await handleSave();
      const lines = parsedData.current.map((e) => e.data);
      const data = Papa.unparse(lines);
      const blob = new Blob([data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `ShopiCSV_${file?.name}`;
      link.href = url;
      link.click();
      displayAlert('Yee haw! 🤠');
      handleCloseFile();
    }
  }

  useEffect(() => {
    if (store.get('columns')) setDisplayCol(JSON.parse(store.get('columns')));
    else setDisplayCol([2, 5, 6]);
  }, []);

  /* ROW FILTERING */
  useEffect(() => {
    let arr = [];
    if (filteredDataIds.length > 0)
      arr = parsedData.current.filter((e) => filteredDataIds.includes(e.id));
    else {
      arr = [...parsedData.current];
      contentRef.current.resetPagination();
    }

    if (filteredDataTypes.length > 0) {
      arr = arr.filter((e) =>
        filteredDataTypes.includes(
          e.data[0].toUpperCase() as TranslatableResourceType
        )
      );
      // Adding a dummy row here because the first one w/o filter is the "Type", "Identification", etc
      // and is being ignored when rendering
      arr.unshift({ id: 0, data: [] });
    }

    setNumOfDisplayedFields(arr.length > 0 ? arr.length - 1 : 0);
    setDisplayedData(arr);
  }, [filteredDataIds, filteredDataTypes]);

  /* KEY BINDINGS */
  useEffect(() => {
    window.addEventListener('keydown', async (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            e.stopImmediatePropagation();
            await handleSave(true);
            break;
          default:
            break;
        }
      }
    });
  }, [handleSave]);

  /* AUTOSAVE */
  useEffect(() => {
    const intervalId = setInterval(async () => {
      if (isEditing && !isLoading) {
        await handleSave(true, true);
      }
    }, 180000);

    return () => clearInterval(intervalId);
  }, [isEditing, handleSave, isLoading, hasEdited]);

  /* AUTO-OPEN */
  useEffect(() => {
    async function openFromMemory() {
      if (store.get('fileData')) {
        try {
          await confirmationDialog({
            allowClose: true,
            title: t('RestoreSessionDialog.title'),
            description: t('RestoreSessionDialog.description', {
              date: formatDistanceToNow(
                new Date(store.get('fileData').savedAt),
                { locale: getDateLocale() }
              ),
            }),
            confirmationText: t('General.yesUpper'),
            cancellationText: t('General.noUpper'),
            confirmationButtonProps: {
              disableElevation: true,
              variant: 'contained',
            },
            cancellationButtonProps: {
              disableElevation: true,
              variant: 'contained',
            },
          });

          setIsLoading(true);
          setIsEditing(false);

          parsedData.current = [];
          parsedData.current = store.get('fileData').content;
          setFileData([...parsedData.current]);
          setDisplayedData([...parsedData.current]);

          fileRef.current = { ...store.get('fileData') };
          setFile({ ...store.get('fileData') });

          displayAlert(
            `${t('RestoreSessionDialog.alertMsg', {
              date: store.get('fileData').savedAt,
            })} 🐘`
          );

          setIsLoading(false);
          setIsEditing(true);
        } catch {
          store.remove('fileData');
        }
      }
    }

    if (!isEditing && !hasClosed) openFromMemory();
  }, [isEditing, hasClosed, confirmationDialog, t, i18n.resolvedLanguage]);

  useEffect(() => {
    store.remove('columns');
    store.set('columns', JSON.stringify(displayCol));
  }, [displayCol]);

  return (
    <>
      <MtAppBar
        data={fileData}
        display={displayCol}
        onDisplayChange={setDisplayCol}
        onUpload={handleUpload}
        onSave={handleSave}
        onDownload={handleDownload}
        onClose={handleCloseFile}
        isLoading={isLoading}
        isEditing={isEditing}
        numOfDisplayedFields={numOfDisplayedFields}
        filteredDataIds={setFilteredDataIds}
        filteredDataTypes={setFilteredTypes}
      />
      <Page fullWidth>
        <MtEditorContent
          ref={contentRef}
          display={displayCol}
          dataType={getDataType()}
          data={displayedData}
          headerContent={fileData[0]?.data}
          renderedFields={renderedFields}
          onSave={handleSave}
          onUpload={handleDrop}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
        />
        <MtAlert ref={alertEl} />
      </Page>
    </>
  );
}
