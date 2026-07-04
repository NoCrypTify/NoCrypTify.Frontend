pipeline {
  agent any

  environment {
    IMAGE_NAME = 'secret-notes-frontend'
    
    // Credentials
    DOCKERHUB_CREDENTIALS = credentials('dockerhub')
    SONAR_TOKEN = credentials('sonarqube-token')
    SNYK_TOKEN = credentials('snyk-token')
    DISCORD_WEBHOOK = credentials('discord-webhook-url')
    
    // Config Variables (Passend ersetzen!)
    SONAR_HOST_URL = 'http://dein-sonarqube-server:9000'
    STAGING_API_URL = 'https://staging.deine-api.com'
  }

  stages {
    stage('Lint') {
      // Läuft nur auf main ODER deploy/production
      when {
        anyOf {
          branch 'main'
          branch 'deploy/production'
        }
      }
      steps {
        sh 'npx snyk auth "$SNYK_TOKEN" && npx snyk test --severity-threshold=high'
        sh 'sonar-scanner -Dsonar.host.url="$SONAR_HOST_URL" -Dsonar.login="$SONAR_TOKEN"'
      }
    }

    stage('Test') {
      when {
        anyOf {
          branch 'main'
          branch 'deploy/production'
        }
      }
      steps {
        sh 'npm ci'
        // TODO §3: add Jest config + >=10 tests.
        sh 'npm test -- --coverage'
      }
    }

    stage('Build') {
      when {
        anyOf {
          branch 'main'
          branch 'deploy/production'
        }
      }
      steps {
        // Build-Arg korrekt mit der Environment-Variable verknüpft
        sh "docker build -t ${IMAGE_NAME}:${env.GIT_COMMIT} --build-arg VITE_API_URL=${STAGING_API_URL} ."
      }
    }

    stage('Deliver') {
      when { branch 'deploy/production' }
      steps {
        sh '''
          echo "$DOCKERHUB_CREDENTIALS_PSW" | docker login -u "$DOCKERHUB_CREDENTIALS_USR" --password-stdin
          docker tag "$IMAGE_NAME:$GIT_COMMIT" "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT"
          docker tag "$IMAGE_NAME:$GIT_COMMIT" "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:latest"
          docker push "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT"
          docker push "$DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:latest"
        '''
      }
    }

    stage('Deploy (Blue/Green)') {
      when { branch 'deploy/production' }
      steps {
        echo 'TODO §8: provision AWS EC2 staging + implement blue/green swap script.'
      }
    }

    stage('E2E & Performance') {
      when { branch 'deploy/production' }
      steps {
        echo 'TODO: run Playwright + k6 against staging; on success, switch Blue/Green.'
      }
    }
  }

  post {
    failure {
      sh '''
        if [ -n "$DISCORD_WEBHOOK" ]; then
          curl -H "Content-Type: application/json" \
            -X POST \
            -d "{\\"content\\": \\"<@&1522970703245348995> ❌ **${JOB_NAME} #${BUILD_NUMBER}** failed on branch **${BRANCH_NAME}**!\\\\nDetails: ${BUILD_URL}\\"}" \
            "$DISCORD_WEBHOOK"
        fi
      '''
    }
  }
}
