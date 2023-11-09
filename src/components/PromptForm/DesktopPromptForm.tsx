import { FormEvent, KeyboardEvent, useEffect, useState, type RefObject } from "react";
import { Box, chakra, Flex, Kbd, Text, InputGroup, VStack, Card, CardBody } from "@chakra-ui/react";
import AutoResizingTextarea from "../AutoResizingTextarea";

import { useSettings } from "../../hooks/use-settings";
import { isMac, isWindows } from "../../lib/utils";
import { TiDeleteOutline } from "react-icons/ti";
import NewButton from "../NewButton";
import MicIcon from "./MicIcon";
import { isTranscriptionSupported } from "../../lib/speech-recognition";
import PromptSendButton from "./PromptSendButton";
import AudioStatus from "./AudioStatus";
import { useLocation } from "react-router-dom";

type KeyboardHintProps = {
  isVisible: boolean;
};

function KeyboardHint({ isVisible }: KeyboardHintProps) {
  const { settings } = useSettings();

  if (!isVisible) {
    return <span />;
  }

  const metaKey = isMac() ? "Command ⌘" : "Ctrl";

  return (
    <Text fontSize="sm" color="gray">
      <span>
        {settings.enterBehaviour === "newline" ? (
          <span>
            <Kbd>{metaKey}</Kbd> + <Kbd>Enter</Kbd> to send
          </span>
        ) : (
          <span>
            <Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> for newline
          </span>
        )}
      </span>
    </Text>
  );
}

type DesktopPromptFormProps = {
  forkUrl: string;
  onSendClick: (prompt: string, image_url: string[]) => void;
  inputPromptRef: RefObject<HTMLTextAreaElement>;
  isLoading: boolean;
  previousMessage?: string;
};

function DesktopPromptForm({
  forkUrl,
  onSendClick,
  inputPromptRef,
  isLoading,
  previousMessage,
}: DesktopPromptFormProps) {
  const [prompt, setPrompt] = useState("");
  // Has the user started typing?
  const [isDirty, setIsDirty] = useState(false);
  const { settings } = useSettings();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const inputType = isRecording || isTranscribing ? "audio" : "text";
  // Base64 images
  const [inputImages, setInputImages] = useState<string[]>([]);
  const location = useLocation();

  // If the user clears the prompt, allow up-arrow again
  useEffect(() => {
    if (!prompt) {
      setIsDirty(false);
    }
  }, [prompt, setIsDirty]);

  // Focus the prompt form when the user navigates
  useEffect(() => {
    inputPromptRef.current?.focus();
  }, [location, inputPromptRef]);
  // Also focus when the chat stops loading
  useEffect(() => {
    if (!isLoading) {
      inputPromptRef.current?.focus();
    }
  }, [isLoading, inputPromptRef]);

  // Keep track of the number of seconds that we've been recording
  useEffect(() => {
    let interval: number | undefined;

    if (isRecording) {
      interval = window.setInterval(() => {
        setRecordingSeconds((seconds) => seconds + 1);
      }, 1_000);
    } else if (!isRecording && recordingSeconds !== 0) {
      window.clearInterval(interval!);
      setRecordingSeconds(0);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isRecording, recordingSeconds]);

  // Handle prompt form submission
  const handlePromptSubmit = (e: FormEvent) => {
    e.preventDefault();
    const textValue = prompt.trim();
    setPrompt("");
    setInputImages([]);
    onSendClick(textValue, inputImages);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    switch (e.key) {
      // Allow the user to cursor-up to repeat last prompt
      case "ArrowUp":
        if (!isDirty && previousMessage) {
          e.preventDefault();
          setPrompt(previousMessage);
          setIsDirty(true);
        }
        break;

      // Prevent blank submissions and allow for multiline input.
      case "Enter":
        // Deal with Enter key based on user preference and state of prompt form
        if (settings.enterBehaviour === "newline") {
          if ((isMac() && e.metaKey) || (isWindows() && e.ctrlKey)) {
            handlePromptSubmit(e);
          }
        } else if (settings.enterBehaviour === "send") {
          if (!e.shiftKey && prompt.length) {
            handlePromptSubmit(e);
          }
        }
        break;

      default:
        setIsDirty(true);
        return;
    }
  };

  const handleRecording = () => {
    setIsRecording(true);
    setIsTranscribing(false);
  };

  const handleTranscribing = () => {
    setIsRecording(false);
    setIsTranscribing(true);
  };

  const handleRecordingCancel = () => {
    setIsRecording(false);
    setIsTranscribing(false);
  };

  const handleTranscriptionAvailable = (transcription: string) => {
    // Use this transcript as our prompt
    onSendClick(transcription, inputImages);
    setIsRecording(false);
    setIsTranscribing(false);
  };

  const getBase64FromFile = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = () => {
        const base64data = reader.result as string;
        resolve(base64data);
      };
    });
  };

  const handleDropImage = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    Promise.all(
      files.filter((file) => file.type.startsWith("image/")).map((file) => getBase64FromFile(file))
    ).then((base64Strings) => {
      setInputImages((prevImages) => [...prevImages, ...base64Strings]);
    });
  };

  const handleDeleteImage = (index: number) => {
    const updatedImages = [...inputImages];
    updatedImages.splice(index, 1);
    setInputImages(updatedImages);
  };

  return (
    <Flex dir="column" w="100%" h="100%">
      <Card flex={1} my={4} mx={1}>
        <chakra.form onSubmit={handlePromptSubmit} h="100%">
          <CardBody h="100%" p={6}>
            <VStack w="100%" h="100%" gap={3}>
              <InputGroup
                h="100%"
                bg="white"
                _dark={{ bg: "gray.700" }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDropImage}
              >
                <Flex w="100%" h="100%" direction="column">
                  <Flex flexWrap="wrap">
                    {inputImages.map((image, index) => (
                      <Box key={index}>
                        <Flex direction="column">
                          <img
                            src={image}
                            alt={`Dragged ${index}`}
                            style={{ width: "100px", height: "100px", objectFit: "cover" }}
                          />
                          <Flex justify="flex-end">
                            <TiDeleteOutline
                              onClick={() => handleDeleteImage(index)}
                              style={{ cursor: "pointer" }}
                            >
                              Delete
                            </TiDeleteOutline>
                          </Flex>
                        </Flex>
                      </Box>
                    ))}
                  </Flex>
                  <Flex flexWrap="wrap">
                    {inputType === "audio" ? (
                      <Box py={2} px={1} flex={1}>
                        <AudioStatus
                          isRecording={isRecording}
                          isTranscribing={isTranscribing}
                          recordingSeconds={recordingSeconds}
                        />
                      </Box>
                    ) : (
                      <AutoResizingTextarea
                        ref={inputPromptRef}
                        variant="unstyled"
                        onKeyDown={handleKeyDown}
                        isDisabled={isLoading}
                        autoFocus={true}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        bg="white"
                        _dark={{ bg: "gray.700" }}
                        placeholder={
                          !isLoading && !isRecording && !isTranscribing
                            ? "Ask a question or use /help to learn more"
                            : undefined
                        }
                        overflowY="auto"
                        flex={1}
                      />
                    )}
                    {isTranscriptionSupported() && (
                      <MicIcon
                        isDisabled={isLoading}
                        onRecording={handleRecording}
                        onTranscribing={handleTranscribing}
                        onTranscriptionAvailable={handleTranscriptionAvailable}
                        onCancel={handleRecordingCancel}
                      />
                    )}
                  </Flex>
                </Flex>
              </InputGroup>

              <Flex w="100%" gap={1} justify={"space-between"} align="center">
                <NewButton forkUrl={forkUrl} variant="outline" />

                <Flex alignItems="center" gap={2}>
                  <KeyboardHint isVisible={!!prompt.length && !isLoading} />
                  <PromptSendButton isLoading={isLoading} />
                </Flex>
              </Flex>
            </VStack>
          </CardBody>
        </chakra.form>
      </Card>
    </Flex>
  );
}

export default DesktopPromptForm;
