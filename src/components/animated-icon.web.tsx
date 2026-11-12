import { Image } from 'expo-image';
import { View } from 'react-native';
import Animated, { Keyframe, Easing } from 'react-native-reanimated';

const DURATION = 300;

export function AnimatedSplashOverlay() {
  return null;
}

const keyframe = new Keyframe({
  0: {
    transform: [{ scale: 0 }],
  },
  60: {
    transform: [{ scale: 1.2 }],
    easing: Easing.elastic(1.2),
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(1.2),
  },
});

const logoKeyframe = new Keyframe({
  0: {
    opacity: 0,
  },
  60: {
    transform: [{ scale: 1.2 }],
    opacity: 0,
    easing: Easing.elastic(1.2),
  },
  100: {
    transform: [{ scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(1.2),
  },
});

const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '-180deg' }, { scale: 0.8 }],
    opacity: 0,
  },
  [DURATION / 1000]: {
    transform: [{ rotateZ: '0deg' }, { scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(0.7),
  },
  100: {
    transform: [{ rotateZ: '7200deg' }],
  },
});

export function AnimatedIcon() {
  return (
    <View className="size-[128px] items-center justify-center">
      <Animated.View
        entering={glowKeyframe.duration(60 * 1000 * 4)}
        className="absolute size-[201px]"
      >
        <Image
          className="absolute size-[201px]"
          source={require('@/assets/images/logo-glow.png')}
        />
      </Animated.View>

      <Animated.View
        className="absolute size-[128px] rounded-[40px]"
        entering={keyframe.duration(DURATION)}
      >
        {/* RN-web không hỗ trợ backgroundImage trên View — dùng DOM element */}
        <div className="size-full rounded-[40px] bg-gradient-to-b from-[#3C9FFE] to-[#0274DF]" />
      </Animated.View>

      <Animated.View
        className="items-center justify-center"
        entering={logoKeyframe.duration(DURATION)}
      >
        <Image
          className="absolute h-[71px] w-[76px]"
          source={require('@/assets/images/expo-logo.png')}
        />
      </Animated.View>
    </View>
  );
}
