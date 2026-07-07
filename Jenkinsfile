pipeline {
  agent any

  tools {
    nodejs 'NodeJS-20' 
  }

  environment {
    IMAGE_NAME = 'secret-notes-frontend'
    
    DOCKERHUB_CREDENTIALS = credentials('dockerhub')
    SONAR_TOKEN = credentials('sonarqube-token')
    SNYK_TOKEN = credentials('snyk-token')
    DISCORD_WEBHOOK = credentials('discord-webhook-url')
    
    SCANNER_HOME = tool 'SonarScanner'
  }

  stages {
    stage('Debug Info') {
      steps {
        echo "-> Aktueller GIT_BRANCH: ${env.GIT_BRANCH}"
      }
    }
    
    stage('Lint') {
      when {
        anyOf {
          expression { env.GIT_BRANCH?.contains('main') }
          expression { env.GIT_BRANCH?.contains('deploy/production') }
        }
      }
      steps {
        sh 'npx snyk auth "$SNYK_TOKEN" && npx snyk test --severity-threshold=high'
        sh '"$SCANNER_HOME/bin/sonar-scanner" -Dsonar.host.url="$SONAR_HOST_URL" -Dsonar.token="$SONAR_TOKEN"'
      }
    }

    stage('Test') {
      when {
        anyOf {
          expression { env.GIT_BRANCH?.contains('main') }
          expression { env.GIT_BRANCH?.contains('deploy/production') }
        }
      }
      steps {
        sh 'npm ci'
        sh 'npm test -- --coverage'
      }
    }

    stage('Build') {
      when {
        anyOf {
          expression { env.GIT_BRANCH?.contains('main') }
          expression { env.GIT_BRANCH?.contains('deploy/production') }
        }
      }
      steps {
        sh "docker build -t ${IMAGE_NAME}:${env.GIT_COMMIT} --build-arg VITE_API_URL=${STAGING_API_URL} ."
      }
    }

    stage('Deliver') {
      when { expression { env.GIT_BRANCH?.contains('deploy/production') } }
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

    stage('Deploy to Staging (Inactive Env)') {
      when { expression { env.GIT_BRANCH?.contains('deploy/production') } }
      steps {
        sshagent(credentials: ['app-ec2-ssh-key']) {
          sh '''
            ACTIVE_BLUE=$(ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST "docker ps -q -f name=frontend-blue | wc -l")

            if [ "$ACTIVE_BLUE" -eq "1" ]; then
              TARGET_ENV="green"
              TARGET_PORT=3001
            else
              TARGET_ENV="blue"
              TARGET_PORT=3000
            fi

            echo "Deploying to INACTIVE environment: $TARGET_ENV on port $TARGET_PORT"

            ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST "
              docker login -u $DOCKERHUB_CREDENTIALS_USR -p $DOCKERHUB_CREDENTIALS_PSW
              docker pull $DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT
              
              docker stop frontend-$TARGET_ENV || true
              docker rm frontend-$TARGET_ENV || true
              
              docker run -d --name frontend-$TARGET_ENV -p $TARGET_PORT:80 $DOCKERHUB_CREDENTIALS_USR/$IMAGE_NAME:$GIT_COMMIT
            "

            echo $TARGET_ENV > target_env.txt
            echo $TARGET_PORT > target_port.txt
          '''
        }
      }
    }

    stage('E2E & Switch Traffic') {
      when { expression { env.GIT_BRANCH?.contains('deploy/production') } }
      steps {
        // 1) Playwright E2E against the freshly-deployed INACTIVE environment.
        //    Runs in a SEPARATE sh step: if any test fails this step exits
        //    non-zero, the stage fails, and the traffic switch below never
        //    runs — users keep the old (still-working) version.
        //    (The API load test with k6 lives in the backend pipeline.)
        sh '''
          set -e
          TARGET_PORT=$(cat target_port.txt)
          npm ci
          npx playwright install --with-deps chromium
          echo "Running Playwright E2E against http://$STAGING_EC2_HOST:$TARGET_PORT"
          E2E_BASE_URL="http://$STAGING_EC2_HOST:$TARGET_PORT" npm run test:e2e
        '''

        // 2) Only reached if the tests above passed: switch nginx to the new
        //    environment and stop the old one.
        sshagent(credentials: ['app-ec2-ssh-key']) {
          sh '''
            echo "Tests successful! Swapping config on host and reloading NGINX proxy..."

            ssh -o StrictHostKeyChecking=no $STAGING_EC2_USER@$STAGING_EC2_HOST << 'EOF'
              
              COLOR_FILE="/home/ubuntu/secret-notes/frontend-prod.colour"
              CONF_FILE="/home/ubuntu/secret-notes/nginx/targets/frontend.conf"
              
              # Verzeichnis zur Sicherheit anlegen
              mkdir -p /home/ubuntu/secret-notes/nginx/targets

              # Status lesen
              if [ -f "$COLOR_FILE" ]; then
                PROD_COLOR=$(cat "$COLOR_FILE")
              else
                PROD_COLOR="blue"
              fi

              # Umschalt-Logik
              if [ "$PROD_COLOR" = "blue" ]; then
                NEW_PROD="green"
                NEW_STAGING="blue"
              else
                NEW_PROD="blue"
                NEW_STAGING="green"
              fi

              echo "Umschalten: $NEW_PROD wird Production, $NEW_STAGING wird Staging."

              # Die kugelsichere Schreibweise ohne Backslash-Probleme:
              echo 'set $frontend_production http://frontend-'"$NEW_PROD"':80;' > "$CONF_FILE"
              echo 'set $frontend_staging http://frontend-'"$NEW_STAGING"':80;' >> "$CONF_FILE"
              
              echo "$NEW_PROD" > "$COLOR_FILE"

              # NGINX neu laden
              docker exec proxy nginx -s reload
EOF

          '''
        }
      }
      post {
        always {
          junit testResults: 'playwright-report/results.xml', allowEmptyResults: true
          archiveArtifacts artifacts: 'playwright-report/**', allowEmptyArchive: true
        }
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
